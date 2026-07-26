import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendNudge } from '../lib/push'
import type { Profile } from '../lib/types'

const PRESETS = [
  { emoji: '🔥', body: "Let's go" },
  { emoji: '🫶', body: 'Proud of you' },
  { emoji: '⚡', body: "Don't break the streak" },
  { emoji: '💪', body: 'Doing mine right now, your turn' },
]

export function NudgeComposer({
  partner,
  onClose,
  onSent,
}: {
  partner: Profile
  onClose: () => void
  onSent?: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sentMessage, setSentMessage] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    supabase.rpc('nudges_remaining_today').then(({ data }) => {
      if (typeof data === 'number') setRemaining(data)
    })
  }, [])

  async function send(body: string, emoji?: string) {
    if (!body.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const result = (await sendNudge({
        to_id: partner.id,
        body: body.trim(),
        emoji: emoji ?? null,
      })) as { queued?: boolean }

      setSentMessage(
        result.queued
          ? `Sent. She's in quiet hours, so it'll land when they end.`
          : 'Sent 🎉',
      )
      setText('')
      setRemaining((r) => (r === null ? r : Math.max(0, r - 1)))
      onSent?.()
      setTimeout(onClose, 1400)
    } catch (err) {
      setError((err as Error).message)
    }
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="safe-bottom w-full max-w-lg overscroll-contain overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Nudge {partner.display_name}
            </h2>
            {remaining !== null && (
              <p className="text-xs text-ink-dim">{remaining} left today</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-ink-dim"
          >
            ✕
          </button>
        </div>

        {sentMessage ? (
          <div className="mt-4 rounded-2xl border border-mine/30 bg-mine/10 p-4 text-center text-sm text-ink">
            {sentMessage}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.body}
                  type="button"
                  disabled={sending || remaining === 0}
                  onClick={() => void send(p.body, p.emoji)}
                  className="min-h-14 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-ink active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="mr-1">{p.emoji}</span>
                  {p.body}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void send(text)
              }}
              className="mt-3 flex gap-2"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={280}
                placeholder="Say something…"
                disabled={remaining === 0}
                className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-4 py-2 text-base text-ink focus:border-mine focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !text.trim() || remaining === 0}
                className="min-h-11 rounded-xl bg-mine px-4 py-2 font-medium text-bg disabled:opacity-60"
              >
                Send
              </button>
            </form>

            {remaining === 0 && (
              <p className="mt-2 text-xs text-ink-dim">
                You've used all 10 nudges for today. Resets tomorrow.
              </p>
            )}
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
