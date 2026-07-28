import type { VercelRequest, VercelResponse } from '@vercel/node'
import { userClient, bearerToken, requireEnv } from './_lib/push.js'

// Groq's free tier is roughly 30 requests/minute and ~1,000 requests/day per
// organization. Two people generating the occasional plan is nowhere near
// that, but 429s are handled explicitly below rather than surfacing a stack
// trace.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

const DIFFICULTIES = ['trivial', 'easy', 'medium', 'hard'] as const
const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'any'] as const

export interface PlanTemplate {
  title: string
  notes: string | null
  goal_id: string | null
  difficulty: (typeof DIFFICULTIES)[number]
  days_of_week: number[]
  time_of_day: (typeof TIMES_OF_DAY)[number]
}

// Models sometimes wrap JSON in ```json fences despite instructions not to.
function stripFences(raw: string): string {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '')
  }
  // Fall back to the outermost braces if there's stray prose around the JSON.
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1)
  }
  return text.trim()
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

// Accepts 3, "3", "Wednesday", "Wed" — models are inconsistent about this
// and dropping the template over it would lose an otherwise good plan.
function coerceDay(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (trimmed in DAY_NAMES) return DAY_NAMES[trimmed]
    const n = Number(trimmed)
    if (Number.isInteger(n) && n >= 0 && n <= 6) return n
  }
  return null
}

// Time benchmarks are stored as SECONDS, so a sub-7:30 mile is 450. Printing
// the raw number told the model to aim for "under 450", which it can only
// read as 450 of something. Mirrors formatValue in src/lib/benchmarks.ts.
function describeValue(value: number | null, format: string, unit: string | null): string {
  if (value === null || value === undefined) return 'unknown'
  if (format === 'time') {
    const total = Math.max(0, Math.round(value))
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
  }
  const rounded = Math.round(value * 100) / 100
  return unit ? `${rounded} ${unit}` : `${rounded}`
}

function coerceString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

// Hand-written validator rather than a schema library — keeps the dependency
// count down and lets each field be coerced to something safe instead of
// rejecting an otherwise-usable plan over one bad value. Deliberately
// forgiving: the user reviews and edits everything before it's saved, so a
// slightly-off default costs far less than an outright failure.
function validatePlan(
  parsed: unknown,
  validGoalIds: Set<string>,
): { templates: PlanTemplate[]; tips: string[] } | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const root = parsed as Record<string, unknown>

  // Accept several plausible shapes for the list itself.
  const rawList =
    (Array.isArray(root.templates) && root.templates) ||
    (Array.isArray(root.plan) && root.plan) ||
    (Array.isArray(root.habits) && root.habits) ||
    (Array.isArray(parsed) ? (parsed as unknown[]) : null)

  if (!rawList) return null

  const templates: PlanTemplate[] = []
  for (const item of rawList) {
    if (typeof item !== 'object' || item === null) continue
    const t = item as Record<string, unknown>

    const title =
      coerceString(t.title, 120) ?? coerceString(t.name, 120) ?? coerceString(t.habit, 120)
    if (!title) continue

    const notes =
      coerceString(t.notes, 600) ??
      coerceString(t.details, 600) ??
      coerceString(t.description, 600)

    const difficulty = DIFFICULTIES.includes(t.difficulty as never)
      ? (t.difficulty as PlanTemplate['difficulty'])
      : 'easy'

    const timeOfDay = TIMES_OF_DAY.includes(t.time_of_day as never)
      ? (t.time_of_day as PlanTemplate['time_of_day'])
      : 'any'

    const rawDays = Array.isArray(t.days_of_week)
      ? t.days_of_week
      : Array.isArray(t.days)
        ? t.days
        : []
    const days = [...new Set(rawDays.map(coerceDay).filter((d): d is number => d !== null))].sort()

    // An unparseable schedule shouldn't kill the row — default to every day
    // and let the user uncheck what they don't want in the preview.
    const finalDays = days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6]

    // Never trust a model-supplied foreign key: only accept goal ids that
    // actually belong to this user.
    const goalId = typeof t.goal_id === 'string' && validGoalIds.has(t.goal_id) ? t.goal_id : null

    templates.push({
      title,
      notes,
      goal_id: goalId,
      difficulty,
      days_of_week: finalDays,
      time_of_day: timeOfDay,
    })
    if (templates.length >= 20) break
  }

  if (templates.length === 0) return null

  const tips = Array.isArray(root.tips)
    ? root.tips
        .map((tip) => coerceString(tip, 240))
        .filter((tip): tip is string => tip !== null)
        .slice(0, 6)
    : []

  return { templates, tips }
}

const SYSTEM_PROMPT = `You are a knowledgeable coach who designs concrete, realistic plans.

Return ONLY raw JSON. No prose outside the JSON, no markdown fences.

Schema:
{
  "templates": [
    {
      "title": string,
      "notes": string,
      "goal_id": string | null,
      "difficulty": "trivial" | "easy" | "medium" | "hard",
      "days_of_week": number[],
      "time_of_day": "morning" | "afternoon" | "evening" | "any"
    }
  ],
  "tips": [string]
}

Rules:
- days_of_week MUST be integers, 0=Sunday through 6=Saturday. Never day names.
- Only use a goal_id from the provided list, or null. Never invent one.
- "title" is short and scannable ("Push day", "Meal prep lunches").
- "notes" carries the ACTUAL substance and is the most important field. Be
  specific and prescriptive:
  * Strength training: name the lifts with sets and reps, e.g.
    "Bench 4x6, Overhead press 3x8, Incline DB press 3x10, Triceps
    pushdown 3x12. Add 5lb when you hit all reps."
  * Running: give the workout, e.g. "3 miles easy, conversational pace.
    Last half mile slightly faster."
  * Nutrition: give concrete actions, e.g. "Cook 4 chicken breasts, 2 cups
    rice, roast a tray of broccoli. Portion into 4 containers."
  * Anything else: say exactly what to do, not a vague intention.
- If the goal implies a split (getting stronger, building muscle), design a
  real split across the week (e.g. push / pull / legs, or upper / lower)
  rather than identical generic "workout" entries.
- Assign difficulty by real effort: trivial = under a minute, easy = a normal
  daily habit, medium = takes real time or focus, hard = genuinely demanding.
- Respect the requested days per week, time of day, and time available.
- Build toward any stated benchmark, ramping up gradually rather than
  starting at the target.
- Return between 1 and 8 templates. Fewer, sustainable habits beat many.
- "tips" is 2 to 4 short, practical pointers specific to what they're doing
  (form cues, common mistakes, how to progress). Not generic filler.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const token = bearerToken(req.headers.authorization)
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  const {
    goal_ids,
    benchmark_ids,
    objective,
    days_per_week,
    time_of_day,
    minutes_per_day,
    constraints,
  } = (req.body ?? {}) as {
    goal_ids?: string[]
    benchmark_ids?: string[]
    objective?: string
    days_per_week?: number
    time_of_day?: string
    minutes_per_day?: number
    constraints?: string
  }

  try {
    const supabase = userClient(token)
    const { data: userData } = await supabase.auth.getUser()
    const me = userData.user?.id
    if (!me) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    // Read goals as the user so RLS applies; this is also what defines the
    // set of goal_ids the model is allowed to reference.
    const { data: goals } = await supabase
      .from('goals')
      .select('id, title, kind, target_per_day, unit, difficulty')
      .eq('owner_id', me)
      .eq('is_active', true)

    const selected = (goals ?? []).filter(
      (g) => !goal_ids?.length || goal_ids.includes(g.id as string),
    )
    const validGoalIds = new Set((goals ?? []).map((g) => g.id as string))

    const { data: benchmarks } = await supabase
      .from('benchmarks')
      .select('id, title, target_value, unit, direction, value_format, best_value, goal_id')
      .eq('owner_id', me)
      .eq('is_active', true)
      .is('achieved_at', null)

    // If the user picked specific targets, plan for exactly those. Otherwise
    // fall back to the open benchmarks attached to the goals they chose,
    // rather than every target they've ever set: an unfocused list of six
    // targets produces an unfocused plan.
    const picked = new Set(benchmark_ids ?? [])
    const relevantBenchmarks =
      picked.size > 0
        ? (benchmarks ?? []).filter((b) => picked.has(b.id as string))
        : (benchmarks ?? []).filter(
            (b) => !b.goal_id || validGoalIds.has(b.goal_id as string),
          )

    const userPrompt = [
      'Build a weekly plan.',
      '',
      objective?.trim() ? `What they want to achieve: ${objective.trim()}` : '',
      '',
      'Existing goals to plan around:',
      selected.length > 0
        ? selected
            .map(
              (g) =>
                `- id=${g.id} "${g.title}" (${g.kind}${
                  g.kind === 'counter' ? `, target ${g.target_per_day} ${g.unit ?? ''}/day` : ''
                })`,
            )
            .join('\n')
        : '- (none selected; use null for goal_id)',
      '',
      relevantBenchmarks.length > 0
        ? `${
            picked.size > 0
              ? 'THE PLAN MUST BUILD TOWARD THESE TARGETS. They are the point of the plan:'
              : 'Targets they are working toward:'
          }\n${relevantBenchmarks
            .map((b) => {
              const format = b.value_format as string
              const unit = (b.unit as string | null) ?? null
              const target = describeValue(b.target_value as number, format, unit)
              const current =
                b.best_value != null
                  ? ` Best so far: ${describeValue(b.best_value as number, format, unit)}.`
                  : ' Nothing logged yet.'
              return `- "${b.title}": aiming for ${
                b.direction === 'lower' ? 'under' : 'at least'
              } ${target}.${current}`
            })
            .join('\n')}`
        : '',
      '',
      `Days per week: ${days_per_week ?? 'their choice'}`,
      `Preferred time of day: ${time_of_day ?? 'any'}`,
      `Time available per day: ${minutes_per_day ? `${minutes_per_day} minutes` : 'unspecified'}`,
      constraints?.trim() ? `Things that get in the way: ${constraints.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${requireEnv('GROQ_API_KEY')}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (groqRes.status === 429) {
      res.status(429).json({
        error: 'The AI is rate limited right now. Give it a minute and try again.',
      })
      return
    }

    if (!groqRes.ok) {
      res.status(502).json({ error: `The AI service returned an error (${groqRes.status}).` })
      return
    }

    const completion = (await groqRes.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = completion.choices?.[0]?.message?.content
    if (!content) {
      res.status(502).json({ error: 'The AI returned an empty response. Try again.' })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(stripFences(content))
    } catch {
      res.status(502).json({
        error: "Couldn't read the AI's response. Try again, or adjust your answers.",
      })
      return
    }

    const result = validatePlan(parsed, validGoalIds)
    if (!result) {
      res.status(502).json({
        error: "The AI's plan didn't come back in a usable shape. Try again.",
      })
      return
    }

    // Nothing is written to the database here — the client shows this as an
    // editable preview and only saves on explicit confirmation.
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
