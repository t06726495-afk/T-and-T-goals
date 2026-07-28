import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [verifying, setVerifying] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSendCode(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(
        error.message.toLowerCase().includes('invite')
          ? "This email isn't invited to mogging."
          : error.message,
      )
      return
    }

    setStatus('sent')
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setErrorMessage('')

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })

    setVerifying(false)
    if (error) {
      setErrorMessage(error.message)
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
              {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
              <button
                type="button"
                onClick={() => {
                  setStatus('idle')
                  setCode('')
                  setErrorMessage('')
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
            {status === 'error' && (
              <p className="text-sm text-danger">{errorMessage}</p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
