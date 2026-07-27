import { supabase } from './supabase'
import { todayInTimezone, dayOfWeekInTimezone } from './date'
import type { TaskTemplate } from './types'

// Materializes today's tasks from active templates, if they don't already
// exist. Idempotent — safe to call on every app open. Relies on the
// (owner_id, template_id, task_date) unique constraint so a double-call
// (or a race between two tabs) can't create duplicates.
export async function ensureTodaysTasks(ownerId: string, timezone: string) {
  const today = todayInTimezone(timezone)
  const dow = dayOfWeekInTimezone(timezone)

  const { data: templates } = await supabase
    .from('task_templates')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_active', true)

  const todaysTemplates = ((templates as TaskTemplate[] | null) ?? []).filter((t) =>
    t.days_of_week.includes(dow),
  )

  if (todaysTemplates.length === 0) return today

  const { data: existing } = await supabase
    .from('tasks')
    .select('template_id')
    .eq('owner_id', ownerId)
    .eq('task_date', today)
    .not('template_id', 'is', null)

  const existingTemplateIds = new Set((existing ?? []).map((r) => r.template_id as string))
  const missing = todaysTemplates.filter((t) => !existingTemplateIds.has(t.id))

  if (missing.length === 0) return today

  await supabase.from('tasks').upsert(
    missing.map((t) => ({
      owner_id: ownerId,
      template_id: t.id,
      goal_id: t.goal_id,
      title: t.title,
      notes: t.notes,
      task_date: today,
      difficulty: t.difficulty,
      time_of_day: t.time_of_day,
    })),
    { onConflict: 'owner_id,template_id,task_date', ignoreDuplicates: true },
  )

  return today
}
