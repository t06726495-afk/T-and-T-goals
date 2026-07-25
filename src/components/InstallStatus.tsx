import { useEffect, useState } from 'react'

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
      <div className="rounded-2xl border border-him/30 bg-him/10 p-4 text-sm text-ink">
        ✅ Installed — you're running this as a standalone app.
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
          Safari and opened from there — iOS 16.4+ is required.
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
          className="mt-3 min-h-11 rounded-full bg-him px-4 py-2 font-medium text-bg"
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
