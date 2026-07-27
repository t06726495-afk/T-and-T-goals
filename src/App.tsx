import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import { NavBar } from './components/NavBar'
import { LoginPage } from './pages/LoginPage'
import { TodayPage } from './pages/TodayPage'
import { GoalsPage } from './pages/GoalsPage'
import { PartnerPage } from './pages/PartnerPage'
import { PointsPage } from './pages/PointsPage'
import { PlannerPage } from './pages/PlannerPage'
import { SettingsPage } from './pages/SettingsPage'

function NotConfiguredScreen() {
  return (
    <div className="safe-top safe-x flex min-h-dvh items-center justify-center px-4 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold text-ink">Almost there</h1>
        <p className="mt-2 text-sm text-ink-dim">
          This deployment is missing <code className="text-ink">VITE_SUPABASE_URL</code>{' '}
          and/or <code className="text-ink">VITE_SUPABASE_ANON_KEY</code>. Add them in
          Vercel → Project Settings → Environment Variables, then redeploy. See{' '}
          <code className="text-ink">SETUP.md</code> for exact steps.
        </p>
      </div>
    </div>
  )
}

// Tapping a notification focuses an existing window and posts the target
// route; without this the app would focus but stay on whatever screen it
// was already showing.
function ServiceWorkerNavigation() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined
      if (data?.type === 'navigate' && data.url) {
        navigate(data.url)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  return null
}

function AuthGate() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-dim">
        Loading…
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <>
      <ServiceWorkerNavigation />
      <NavBar />
      <main className="safe-x safe-bottom">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/partner" element={<PartnerPage />} />
          <Route path="/points" element={<PointsPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </>
  )
}

function App() {
  if (!isSupabaseConfigured) {
    return <NotConfiguredScreen />
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
