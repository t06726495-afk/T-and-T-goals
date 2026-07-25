import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
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

  return (
    <div className="safe-top safe-x flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink">mogging</h1>
        <p className="mt-1 text-ink-dim">Sign in with a magic link.</p>

        {status === 'sent' ? (
          <div className="mt-6 rounded-2xl border border-him/30 bg-him/10 p-4 text-sm text-ink">
            Check <span className="font-medium">{email}</span> for a sign-in
            link. You can close this tab.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 py-2 text-ink placeholder:text-ink-dim focus:border-him focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="min-h-11 w-full rounded-xl bg-him px-4 py-2 font-medium text-bg disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {status === 'error' && (
              <p className="text-sm text-her">{errorMessage}</p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
