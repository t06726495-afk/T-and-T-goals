import { supabase } from './supabase'

// Exports everything the signed-in person owns. RLS does the filtering, so
// this can never pull the partner's private rows even by accident — what
// you get is exactly what you're allowed to read.
export async function exportMyData(profileId: string) {
  const [
    profile,
    settings,
    goals,
    goalLogs,
    templates,
    tasks,
    benchmarks,
    benchmarkEntries,
    nudgesSent,
    nudgesReceived,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase.from('user_settings').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('goals').select('*').eq('owner_id', profileId),
    supabase.from('goal_logs').select('*').eq('owner_id', profileId),
    supabase.from('task_templates').select('*').eq('owner_id', profileId),
    supabase.from('tasks').select('*').eq('owner_id', profileId),
    supabase.from('benchmarks').select('*').eq('owner_id', profileId),
    supabase.from('benchmark_entries').select('*').eq('owner_id', profileId),
    supabase.from('nudges').select('*').eq('from_id', profileId),
    supabase.from('nudges').select('*').eq('to_id', profileId),
  ])

  return {
    exported_at: new Date().toISOString(),
    app: 'mogging',
    profile: profile.data ?? null,
    settings: settings.data ?? null,
    goals: goals.data ?? [],
    goal_logs: goalLogs.data ?? [],
    task_templates: templates.data ?? [],
    tasks: tasks.data ?? [],
    benchmarks: benchmarks.data ?? [],
    benchmark_entries: benchmarkEntries.data ?? [],
    nudges_sent: nudgesSent.data ?? [],
    nudges_received: nudgesReceived.data ?? [],
  }
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
