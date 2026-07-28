import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { DIFFICULTY_OPTIONS } from '../lib/pickers'
import { timeOfDayLabel } from '../lib/date'
import { formatValue } from '../lib/benchmarks'
import type { Benchmark, Difficulty, Goal, TimeOfDay } from '../lib/types'

interface PlanTemplate {
  title: string
  notes: string | null
  goal_id: string | null
  difficulty: Difficulty
  days_of_week: number[]
  time_of_day: TimeOfDay
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const OBJECTIVE_EXAMPLES = [
  'Get stronger',
  'Run a faster mile',
  'Eat healthier',
  'Sleep better',
  'Read more',
]

type Step =
  | 'objective'
  | 'goals'
  | 'benchmarks'
  | 'days'
  | 'time'
  | 'minutes'
  | 'constraints'
  | 'loading'
  | 'preview'

const TIME_CHOICES: { value: TimeOfDay; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'any', label: 'Anytime' },
]

export function PlannerPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [goals, setGoals] = useState<Goal[]>([])
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [step, setStep] = useState<Step>('objective')
  const [objective, setObjective] = useState('')
  const [selectedGoals, setSelectedGoals] = useState<string[]>([])
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>([])
  const [daysPerWeek, setDaysPerWeek] = useState(4)
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('any')
  const [minutes, setMinutes] = useState(30)
  const [constraints, setConstraints] = useState('')
  const [plan, setPlan] = useState<PlanTemplate[]>([])
  const [tips, setTips] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    const [{ data: goalRows }, { data: benchmarkRows }] = await Promise.all([
      supabase
        .from('goals')
        .select('*')
        .eq('owner_id', profile.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      // Only targets still open: there's nothing to plan toward on one that's
      // already been hit.
      supabase
        .from('benchmarks')
        .select('*')
        .eq('owner_id', profile.id)
        .eq('is_active', true)
        .is('achieved_at', null)
        .order('created_at', { ascending: true }),
    ])
    setGoals((goalRows as Goal[]) ?? [])
    setBenchmarks((benchmarkRows as Benchmark[]) ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    void load()
  }, [load])

  async function generate() {
    setStep('loading')
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not signed in')

      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          goal_ids: selectedGoals,
          benchmark_ids: selectedBenchmarks,
          objective,
          days_per_week: daysPerWeek,
          time_of_day: timeOfDay,
          minutes_per_day: minutes,
          constraints,
        }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        templates?: PlanTemplate[]
        tips?: string[]
        error?: string
      }

      if (!res.ok || !json.templates) {
        setError(json.error || 'Something went wrong generating the plan.')
        setStep('constraints')
        return
      }

      setPlan(json.templates)
      setTips(json.tips ?? [])
      setStep('preview')
    } catch (err) {
      setError((err as Error).message)
      setStep('constraints')
    }
  }

  // Nothing touches the database until this runs.
  async function confirmPlan() {
    if (!profile) return
    setSaving(true)
    setError('')

    const { error: writeError } = await supabase.from('task_templates').insert(
      plan.map((t) => ({
        owner_id: profile.id,
        goal_id: t.goal_id,
        title: t.title,
        notes: t.notes,
        difficulty: t.difficulty,
        days_of_week: t.days_of_week,
        time_of_day: t.time_of_day,
        source: 'ai',
      })),
    )

    setSaving(false)
    if (writeError) {
      setError(writeError.message)
      return
    }
    navigate('/')
  }

  function updateTemplate(index: number, patch: Partial<PlanTemplate>) {
    setPlan((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  }

  function removeTemplate(index: number) {
    setPlan((prev) => prev.filter((_, i) => i !== index))
  }

  if (!profile) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-ink-dim">Loading…</div>
  }

  // The benchmark step is skipped entirely when there's nothing to pick, so
  // the progress dots shouldn't promise a step that never arrives.
  const questionSteps: Step[] = [
    'objective',
    'goals',
    ...(benchmarks.length > 0 ? (['benchmarks'] as Step[]) : []),
    'days',
    'time',
    'minutes',
    'constraints',
  ]

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-3xl font-semibold text-ink">Planner</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Answer a few questions and get a weekly plan you can edit before saving.
      </p>

      {step !== 'preview' && step !== 'loading' && (
        <StepDots current={step} steps={questionSteps} />
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-ink">
          {error}
        </div>
      )}

      {step === 'objective' && (
        <StepCard
          question="What are you trying to achieve?"
          hint="Be as specific as you like. This drives everything else."
          onNext={() => setStep('goals')}
        >
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Get stronger, especially upper body…"
            className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-base text-ink focus:border-mine focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {OBJECTIVE_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setObjective(ex)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-ink-dim"
              >
                {ex}
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {step === 'goals' && (
        <StepCard
          question="Any existing goals to build around?"
          hint="Optional. Skip if this is something new."
          onBack={() => setStep('objective')}
          onNext={() => setStep(benchmarks.length > 0 ? 'benchmarks' : 'days')}
        >
          {goals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <p className="text-sm text-ink">No goals yet</p>
              <p className="mt-1 text-xs text-ink-dim">
                You can still get general suggestions, or add goals first.
              </p>
              <button
                type="button"
                onClick={() => navigate('/goals')}
                className="mt-3 min-h-11 rounded-xl border border-border px-4 py-2 text-sm text-ink-dim"
              >
                Go to Goals
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {goals.map((g) => {
                const on = selectedGoals.includes(g.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() =>
                      setSelectedGoals((prev) =>
                        on ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                      )
                    }
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left ${
                      on ? 'border-mine bg-mine/10' : 'border-border bg-surface-raised'
                    }`}
                  >
                    <span className="text-xl">{g.emoji}</span>
                    <span className="flex-1 text-ink">{g.title}</span>
                    {on && <span className="text-mine">✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </StepCard>
      )}

      {step === 'benchmarks' && (
        <StepCard
          question="Working toward a target?"
          hint="Optional. Picking one makes the plan build up to it."
          onBack={() => setStep('goals')}
          onNext={() => setStep('days')}
        >
          <div className="space-y-2">
            {benchmarks.map((b) => {
              const on = selectedBenchmarks.includes(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() =>
                    setSelectedBenchmarks((prev) =>
                      on ? prev.filter((id) => id !== b.id) : [...prev, b.id],
                    )
                  }
                  className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left ${
                    on ? 'border-mine bg-mine/10' : 'border-border bg-surface-raised'
                  }`}
                >
                  <span className="text-xl">{b.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{b.title}</span>
                    <span className="block text-xs text-ink-dim">
                      {b.direction === 'lower' ? 'Under' : 'At least'}{' '}
                      {formatValue(b.target_value, b.value_format, b.unit)}
                      {b.best_value != null && (
                        <> · best {formatValue(b.best_value, b.value_format, b.unit)}</>
                      )}
                    </span>
                  </span>
                  {on && <span className="text-mine">✓</span>}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-ink-dim">
            Pick nothing and the plan still considers any targets tied to the goals
            you chose.
          </p>
        </StepCard>
      )}

      {step === 'days' && (
        <StepCard
          question="How many days a week?"
          onBack={() => setStep(benchmarks.length > 0 ? 'benchmarks' : 'goals')}
          onNext={() => setStep('time')}
        >
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDaysPerWeek(n)}
                className={`min-h-14 rounded-xl border text-lg font-medium ${
                  daysPerWeek === n
                    ? 'border-mine bg-mine/10 text-mine'
                    : 'border-border bg-surface-raised text-ink-dim'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {step === 'time' && (
        <StepCard
          question="What time of day works?"
          onBack={() => setStep('days')}
          onNext={() => setStep('minutes')}
        >
          <div className="grid grid-cols-2 gap-2">
            {TIME_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setTimeOfDay(c.value)}
                className={`min-h-14 rounded-xl border font-medium ${
                  timeOfDay === c.value
                    ? 'border-mine bg-mine/10 text-mine'
                    : 'border-border bg-surface-raised text-ink-dim'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {step === 'minutes' && (
        <StepCard
          question="How much time per day?"
          onBack={() => setStep('time')}
          onNext={() => setStep('constraints')}
        >
          <div className="grid grid-cols-3 gap-2">
            {[10, 15, 20, 30, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={`min-h-14 rounded-xl border font-medium ${
                  minutes === m
                    ? 'border-mine bg-mine/10 text-mine'
                    : 'border-border bg-surface-raised text-ink-dim'
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {step === 'constraints' && (
        <StepCard
          question="Anything that would get in the way?"
          hint="Optional. Work schedule, injuries, no gym access…"
          onBack={() => setStep('minutes')}
          nextLabel="Generate plan"
          onNext={() => void generate()}
        >
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="I work late Tuesdays and Thursdays…"
            className="w-full rounded-xl border border-border bg-surface-raised px-4 py-3 text-base text-ink focus:border-mine focus:outline-none"
          />
        </StepCard>
      )}

      {step === 'loading' && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-ink">Building your plan…</p>
          <p className="mt-1 text-sm text-ink-dim">This usually takes a few seconds.</p>
        </div>
      )}

      {step === 'preview' && (
        <div className="mt-6">
          <div className="rounded-2xl border border-mine/30 bg-mine/10 p-3 text-sm text-ink">
            Edit anything below. Nothing is saved until you hit Confirm.
          </div>

          {plan.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-ink">You removed everything</p>
              <button
                type="button"
                onClick={() => setStep('objective')}
                className="mt-3 min-h-11 rounded-xl border border-border px-4 py-2 text-sm text-ink-dim"
              >
                Start over
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {plan.map((t, i) => (
                <PlanRow
                  key={i}
                  template={t}
                  goals={goals}
                  onChange={(patch) => updateTemplate(i, patch)}
                  onRemove={() => removeTemplate(i)}
                />
              ))}
            </div>
          )}

          {tips.length > 0 && (
            <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-medium text-ink-dim">Tips</h3>
              <ul className="mt-2 space-y-2">
                {tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink">
                    <span className="text-mine">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-dim">
                Tips are just guidance. They aren't saved as tasks.
              </p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep('objective')}
              className="min-h-11 flex-1 rounded-xl border border-border px-4 py-2 font-medium text-ink-dim"
            >
              Start over
            </button>
            <button
              type="button"
              onClick={() => void confirmPlan()}
              disabled={saving || plan.length === 0}
              className="min-h-11 flex-[2] rounded-xl bg-mine px-4 py-2 font-medium text-bg disabled:opacity-60"
            >
              {saving ? 'Saving…' : `Confirm ${plan.length} habit${plan.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StepDots({ current, steps }: { current: Step; steps: Step[] }) {
  const index = steps.indexOf(current)
  return (
    <div className="mt-4 flex gap-1.5">
      {steps.map((s, i) => (
        <span
          key={s}
          className="h-1 flex-1 rounded-full transition-colors"
          style={{
            backgroundColor: i <= index ? 'var(--color-mine)' : 'var(--color-border)',
          }}
        />
      ))}
    </div>
  )
}

function StepCard({
  question,
  hint,
  children,
  onBack,
  onNext,
  nextLabel = 'Next',
}: {
  question: string
  hint?: string
  children: React.ReactNode
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
}) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-lg font-medium text-ink">{question}</h2>
      {hint && <p className="mt-1 text-xs text-ink-dim">{hint}</p>}

      <div className="mt-4">{children}</div>

      <div className="mt-5 flex gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 flex-1 rounded-xl border border-border px-4 py-2 font-medium text-ink-dim"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="min-h-11 flex-[2] rounded-xl bg-mine px-4 py-2 font-medium text-bg"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}

function PlanRow({
  template,
  goals,
  onChange,
  onRemove,
}: {
  template: PlanTemplate
  goals: Goal[]
  onChange: (patch: Partial<PlanTemplate>) => void
  onRemove: () => void
}) {
  function toggleDay(day: number) {
    const has = template.days_of_week.includes(day)
    const next = has
      ? template.days_of_week.filter((d) => d !== day)
      : [...template.days_of_week, day].sort()
    onChange({ days_of_week: next })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <input
          value={template.title}
          onChange={(e) => onChange({ title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-base text-ink focus:border-mine focus:outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-dim"
        >
          ✕
        </button>
      </div>

      {/* The actual substance of the plan — the lifts, the distances, the
          meal prep steps. Editable like everything else. */}
      <textarea
        value={template.notes ?? ''}
        onChange={(e) => onChange({ notes: e.target.value || null })}
        rows={template.notes ? 3 : 2}
        placeholder="Details (sets, reps, distance, steps…)"
        className="mt-2 w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-mine focus:outline-none"
      />

      <div className="mt-2 flex gap-1">
        {DAY_LABELS.map((label, day) => {
          const on = template.days_of_week.includes(day)
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              aria-label={DAY_NAMES[day]}
              className={`h-9 flex-1 rounded-lg border text-xs font-medium ${
                on ? 'border-mine bg-mine/15 text-mine' : 'border-border text-ink-dim'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-2">
        <select
          value={template.difficulty}
          onChange={(e) => onChange({ difficulty: e.target.value as Difficulty })}
          className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:outline-none"
        >
          {DIFFICULTY_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label} · {d.points} pts
            </option>
          ))}
        </select>

        <select
          value={template.time_of_day}
          onChange={(e) => onChange({ time_of_day: e.target.value as TimeOfDay })}
          className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:outline-none"
        >
          {(['morning', 'afternoon', 'evening', 'any'] as TimeOfDay[]).map((t) => (
            <option key={t} value={t}>
              {timeOfDayLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {goals.length > 0 && (
        <select
          value={template.goal_id ?? ''}
          onChange={(e) => onChange({ goal_id: e.target.value || null })}
          className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:outline-none"
        >
          <option value="">Not linked to a goal</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.emoji} {g.title}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
