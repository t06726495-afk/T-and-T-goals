// Shared helpers for the serverless functions. Files prefixed with "_" are
// not treated as routes by Vercel.
//
// Every secret referenced here (service role key, VAPID private key, cron
// secret) is read from the environment inside these server-only modules and
// never reaches the client bundle.
import webpush from 'web-push'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

let vapidConfigured = false

function configureVapid() {
  if (vapidConfigured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@example.com',
    requireEnv('VAPID_PUBLIC_KEY'),
    requireEnv('VAPID_PRIVATE_KEY'),
  )
  vapidConfigured = true
}

// Service-role client: needed because a sender cannot read the recipient's
// push_subscriptions rows under RLS (correctly — those are private). Only
// ever used server-side, and only for the narrow lookups below.
export function adminClient(): SupabaseClient {
  return createClient(
    requireEnv('VITE_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}

// Client acting as the calling user, so RLS still applies to their writes.
export function userClient(accessToken: string): SupabaseClient {
  return createClient(requireEnv('VITE_SUPABASE_URL'), requireEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export interface NotificationPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

// Sends to every device a person has registered. Subscriptions that come
// back 404/410 are dead (app uninstalled, permission revoked) and get
// pruned so we don't retry them forever.
export async function sendToProfile(
  admin: SupabaseClient,
  profileId: string,
  payload: NotificationPayload,
): Promise<{ sent: number; removed: number }> {
  configureVapid()

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId)

  const rows = (subs as PushSubscriptionRow[] | null) ?? []
  let sent = 0
  const dead: string[] = []

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify(payload),
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          dead.push(row.id)
        }
      }
    }),
  )

  if (dead.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', dead)
  }

  return { sent, removed: dead.length }
}

export function bearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}
