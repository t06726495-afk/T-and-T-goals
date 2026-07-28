import { useEffect, useState } from 'react'

// The shell is precached so the app still opens without signal, but writes
// need the network — so say so plainly rather than letting taps look like
// they worked and then silently revert.
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="safe-x bg-danger/15 px-4 py-2 text-center text-xs text-ink">
      You're offline. Changes won't save until you reconnect.
    </div>
  )
}
