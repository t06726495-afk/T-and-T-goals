import { supabase } from './supabase'

export type PushStatus =
  | 'unsupported' // browser has no Push API at all
  | 'needs-install' // iOS Safari tab: must be added to Home Screen first
  | 'denied'
  | 'default' // supported, not yet asked
  | 'subscribed'

export function isIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch check disambiguates.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) {
    // On iOS, Push exists only once installed to the Home Screen — so a
    // plain Safari tab reports unsupported. Distinguish the two, because
    // the fix is completely different.
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  }

  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'default'
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

// Must be called from a real user gesture — browsers reject
// requestPermission() otherwise, and iOS silently no-ops.
export async function subscribeToPush(profileId: string): Promise<PushStatus> {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    throw new Error('Notifications are not configured yet (missing VITE_VAPID_PUBLIC_KEY).')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return permission === 'denied' ? 'denied' : 'default'
  }

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    }))

  const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } }

  await supabase.from('push_subscriptions').upsert(
    {
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey('p256dh')),
      auth: json.keys?.auth ?? arrayBufferToBase64(sub.getKey('auth')),
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: 'endpoint' },
  )

  return 'subscribed'
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

async function authedFetch(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error((json.error as string) || `Request failed (${res.status})`)
  }
  return json
}

export async function sendNudge(params: {
  to_id: string
  body: string
  emoji?: string | null
  goal_id?: string | null
}) {
  return authedFetch('/api/nudge', params)
}

// Fire-and-forget: a celebration failing to send should never interrupt or
// roll back the thing the user actually did.
export function notifyPartner(params: {
  kind: 'goal_completed' | 'streak_milestone' | 'benchmark_hit'
  goal_id?: string
  benchmark_id?: string
  streak?: number
}) {
  void authedFetch('/api/notify-partner', params).catch(() => {})
}
