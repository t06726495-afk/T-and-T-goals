import { useState } from 'react'

// Presets for speed, plus a "+" that opens a free field so any emoji works.
// Shared so every picker in the app behaves the same way.
export function EmojiPicker({
  value,
  onChange,
  presets,
}: {
  value: string
  onChange: (emoji: string) => void
  presets: string[]
}) {
  const [custom, setCustom] = useState(!presets.includes(value))

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {presets.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setCustom(false)
              onChange(e)
            }}
            className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl ${
              !custom && value === e ? 'border-mine bg-mine/10' : 'border-border bg-surface-raised'
            }`}
          >
            {e}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom(true)}
          aria-label="Use a different emoji"
          className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl ${
            custom
              ? 'border-mine bg-mine/10 text-mine'
              : 'border-border bg-surface-raised text-ink-dim'
          }`}
        >
          +
        </button>
      </div>

      {custom && (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 4))}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder="Paste or type any emoji"
          className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface-raised px-4 py-2 text-center text-2xl text-ink focus:border-mine focus:outline-none"
        />
      )}
    </div>
  )
}
