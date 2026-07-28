// Keeping an installed PWA up to date.
//
// The service worker already calls skipWaiting() and clients.claim(), so a
// new build takes over as soon as it's fetched. But the PAGE that's already
// open keeps running the old JavaScript until something reloads it, and an
// installed iOS app is resumed rather than restarted, so it can sit on an old
// build for days. That's the whole "I pushed but nothing changed" trap.
//
// So: reload once when a new worker takes control, and give Settings a way to
// force the check by hand.

const RELOAD_GUARD = 'mogging:sw-reloaded'

export function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // controllerchange also fires the very first time a worker takes control
    // on a fresh install, where there's nothing to update to. sessionStorage
    // keeps that (and any pathological loop) to a single reload per session.
    if (sessionStorage.getItem(RELOAD_GUARD)) return
    sessionStorage.setItem(RELOAD_GUARD, '1')
    window.location.reload()
  })

  // iOS resumes the app rather than reloading it, so a check on every return
  // to the foreground is the closest thing to "check on launch".
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })
}

/** Asks the browser to re-fetch the worker. Resolves whether or not one was found. */
export async function checkForUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update()
  } catch {
    // Offline, or no worker registered yet. Nothing to do either way.
  }
}

/** Settings' escape hatch: check, then reload regardless of what was found. */
export async function forceRefresh(): Promise<void> {
  await checkForUpdate()
  sessionStorage.removeItem(RELOAD_GUARD)
  window.location.reload()
}
