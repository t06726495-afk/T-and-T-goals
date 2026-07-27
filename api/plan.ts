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

// Hand-written validator rather than a schema library — keeps the dependency
// count down and lets each field be coerced to something safe instead of
// rejecting an otherwise-usable plan over one bad value.
function validatePlan(parsed: unknown, validGoalIds: Set<string>): PlanTemplate[] | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const templates = (parsed as { templates?: unknown }).templates
  if (!Array.isArray(templates)) return null

  const out: PlanTemplate[] = []
  for (const item of templates) {
    if (typeof item !== 'object' || item === null) continue
    const t = item as Record<string, unknown>

    const title = typeof t.title === 'string' ? t.title.trim().slice(0, 120) : ''
    if (!title) continue

    const difficulty = DIFFICULTIES.includes(t.difficulty as never)
      ? (t.difficulty as PlanTemplate['difficulty'])
      : 'easy'

    const timeOfDay = TIMES_OF_DAY.includes(t.time_of_day as never)
      ? (t.time_of_day as PlanTemplate['time_of_day'])
      : 'any'

    const days = Array.isArray(t.days_of_week)
      ? [...new Set(t.days_of_week.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      : []
    if (days.length === 0) continue

    // Never trust a model-supplied foreign key: only accept goal ids that
    // actually belong to this user.
    const goalId =
      typeof t.goal_id === 'string' && validGoalIds.has(t.goal_id) ? t.goal_id : null

    out.push({ title, goal_id: goalId, difficulty, days_of_week: days.sort(), time_of_day: timeOfDay })
    if (out.length >= 20) break
  }

  return out.length > 0 ? out : null
}

const SYSTEM_PROMPT = `You design realistic daily habit plans.

Return ONLY raw JSON. No prose, no explanation, no markdown fences.

Schema:
{"templates":[{"title":string,"goal_id":string|null,"difficulty":"trivial"|"easy"|"medium"|"hard","days_of_week":number[],"time_of_day":"morning"|"afternoon"|"evening"|"any"}]}

Rules:
- days_of_week uses 0=Sunday through 6=Saturday.
- Only use a goal_id from the provided list, or null. Never invent one.
- Titles are short and actionable ("Run 2 miles", not "Work on your running").
- Assign difficulty by real effort: trivial = under a minute, easy = a normal
  daily habit, medium = takes real time or focus, hard = genuinely demanding.
- Respect the requested days per week and time of day.
- Build toward any stated benchmark, ramping up gradually rather than
  starting at the target.
- Return between 1 and 8 templates. Fewer, sustainable habits beat many.`

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

  const { goal_ids, days_per_week, time_of_day, minutes_per_day, constraints } = (req.body ??
    {}) as {
    goal_ids?: string[]
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
      .select('title, target_value, unit, direction, value_format, best_value, goal_id')
      .eq('owner_id', me)
      .eq('is_active', true)
      .is('achieved_at', null)

    const relevantBenchmarks = (benchmarks ?? []).filter(
      (b) => !b.goal_id || validGoalIds.has(b.goal_id as string),
    )

    const userPrompt = [
      'Build a weekly habit plan.',
      '',
      'Goals to plan for:',
      selected.length > 0
        ? selected
            .map(
              (g) =>
                `- id=${g.id} "${g.title}" (${g.kind}${
                  g.kind === 'counter' ? `, target ${g.target_per_day} ${g.unit ?? ''}/day` : ''
                })`,
            )
            .join('\n')
        : '- (none selected; suggest general habits and use null for goal_id)',
      '',
      relevantBenchmarks.length > 0
        ? `Targets they are working toward:\n${relevantBenchmarks
            .map(
              (b) =>
                `- "${b.title}": aiming for ${b.direction === 'lower' ? 'under' : 'at least'} ${
                  b.target_value
                }${b.unit ? ` ${b.unit}` : ''}${
                  b.best_value != null ? ` (currently ${b.best_value})` : ''
                }`,
            )
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
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (groqRes.status === 429) {
      res.status(429).json({
        error: "The AI is rate limited right now. Give it a minute and try again.",
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

    const templates = validatePlan(parsed, validGoalIds)
    if (!templates) {
      res.status(502).json({
        error: "The AI's plan didn't come back in a usable shape. Try again.",
      })
      return
    }

    // Nothing is written to the database here — the client shows this as an
    // editable preview and only saves on explicit confirmation.
    res.status(200).json({ templates })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
