import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { AuthError } from '@supabase/supabase-js'

// Supabase builds an error message by reaching for msg / message /
// error_description / error on the response body, and falls back to
// JSON.stringify when it finds none. An unclassified database failure comes
// back with an empty body, so that fallback renders the literal string "{}"
// on screen. Never show that to someone trying to sign in.
function isUnusable(message: string): boolean {
  const trimmed = message.trim()
  return trimmed === '' || trimmed === '{}' || trimmed === '[object Object]'
}

interface FriendlyError {
  message: string
  /** Kept for the small print, so a real problem is still diagnosable. */
  detail?: string
}

function describeAuthError(error: AuthError): FriendlyError {
  const raw = error.message ?? ''
  const lower = raw.toLowerCase()

  if (lower.includes('invite') || lower.includes('not allowed')) {
    return { message: "This email isn't on the invite list for mogging." }
  }

  if (lower.includes('rate limit') || error.status === 429) {
    return {
      message: 'Too many codes requested. Wait a few minutes and try again.',
    }
  }

  // A signup blocked by the invite-list trigger surfaces as a database error,
  // because the trigger fires while the account row is being created. It is
  // by far the most likely reason a brand new email fails here.
  if (lower.includes('database error') || isUnusable(raw)) {
    return {
      message:
        "Couldn't start sign-in for this email. If this is your first time here, " +
        'it may not be on the invite list yet.',
      detail: isUnusable(raw) ? `Status ${error.status ?? 'unknown'}` : raw,
    }
  }

  return { message: raw }
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [verifying, setVerifying] = useState(false)
  const [failure, setFailure] = useState<FriendlyError | null>(null)

  async function handleSendCode(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setFailure(null)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })

    if (error) {
      setStatus('error')
      setFailure(describeAuthError(error))
      return
    }

    setStatus('sent')
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setFailure(null)

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })

    setVerifying(false)
    if (error) {
      setFailure(describeAuthError(error))
      return
    }
    // On success, AuthProvider's onAuthStateChange picks up the new session
    // automatically and swaps this screen out — nothing else to do here.
  }

  return (
    <div className="safe-top safe-x flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink">mogging</h1>
        <p className="mt-1 text-ink-dim">Sign in with a code sent to your email.</p>

        {status === 'sent' ? (
          <>
            <div className="mt-6 rounded-2xl border border-mine/30 bg-mine/10 p-4 text-sm text-ink">
              We sent a code to <span className="font-medium">{email}</span>.
              Enter it below. No need to leave this app.
            </div>

            <form onSubmit={handleVerifyCode} className="mt-4 space-y-3">
              <input
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="12345678"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 py-2 text-center text-2xl tracking-[0.3em] text-ink placeholder:tracking-normal placeholder:text-ink-dim focus:border-mine focus:outline-none"
              />
              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="min-h-11 w-full rounded-xl bg-mine px-4 py-2 font-medium text-bg disabled:opacity-60"
              >
                {verifying ? 'Checking…' : 'Verify code'}
              </button>
              <ErrorNote failure={failure} />
              <button
                type="button"
                onClick={() => {
                  setStatus('idle')
                  setCode('')
                  setFailure(null)
                }}
                className="w-full text-center text-sm text-ink-dim underline"
              >
                Use a different email
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleSendCode} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 py-2 text-ink placeholder:text-ink-dim focus:border-mine focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="min-h-11 w-full rounded-xl bg-mine px-4 py-2 font-medium text-bg disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send sign-in code'}
            </button>
            {status === 'error' && <ErrorNote failure={failure} />}
          </form>
        )}
      </div>
    </div>
  )
}

function ErrorNote({ failure }: { failure: FriendlyError | null }) {
  if (!failure) return null
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/10 p-3">
      <p className="text-sm text-danger">{failure.message}</p>
      {failure.detail && <p className="mt-1 text-xs text-ink-dim">{failure.detail}</p>}
    </div>
  )
}
