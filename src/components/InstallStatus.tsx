import { useEffect, useState } from 'react'
import { forceRefresh } from '../lib/sw-update'

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's pre-standard flag
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// An installed PWA is resumed rather than restarted, so it can keep serving
// an old build long after a new one has shipped. The app reloads itself when
// it notices one, but this is the button for when you know an update exists
// and don't want to wait for it to be noticed.
function UpdateButton() {
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void forceRefresh()
      }}
      className="mt-3 min-h-11 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium text-ink-dim disabled:opacity-60"
    >
      {busy ? 'Reloading…' : 'Check for updates'}
    </button>
  )
}

export function InstallStatus() {
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)

  useEffect(() => {
    setStandalone(isStandalone())
    setIos(isIOS())

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (standalone) {
    return (
      <div className="rounded-2xl border border-mine/30 bg-mine/10 p-4 text-sm text-ink">
        <p>✅ Installed. You're running this as a standalone app.</p>
        <UpdateButton />
      </div>
    )
  }

  if (ios) {
    return (
      <div className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-ink-dim">
        <p className="mb-2 font-medium text-ink">Install on iPhone</p>
        <ol className="list-inside list-decimal space-y-1">
          <li>Open this page in Safari (not another browser or in-app view).</li>
          <li>
            Tap the <span className="text-ink">Share</span> icon in the toolbar.
          </li>
          <li>
            Scroll down and tap <span className="text-ink">Add to Home Screen</span>.
          </li>
          <li>Tap Add, then open the app from your Home Screen.</li>
        </ol>
        <p className="mt-2 text-xs">
          Notifications only work once this is added to your Home Screen from
          Safari and opened from there. iOS 16.4 or later is required.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-ink-dim">
      <p className="mb-2 font-medium text-ink">Install this app</p>
      <p>
        Use your browser menu and choose{' '}
        <span className="text-ink">Add to Home Screen</span> or{' '}
        <span className="text-ink">Install App</span>.
      </p>
      {deferredPrompt && (
        <button
          type="button"
          className="mt-3 min-h-11 rounded-full bg-mine px-4 py-2 font-medium text-bg"
          onClick={async () => {
            const promptEvent = deferredPrompt as Event & {
              prompt: () => void
            }
            promptEvent.prompt()
            setDeferredPrompt(null)
          }}
        >
          Install
        </button>
      )}
    </div>
  )
}
