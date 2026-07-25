import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import { NavBar } from './components/NavBar'
import { LoginPage } from './pages/LoginPage'
import { TodayPage } from './pages/TodayPage'
import { SettingsPage } from './pages/SettingsPage'
import { ComingSoonPage } from './pages/ComingSoonPage'

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
      <NavBar />
      <main className="safe-x safe-bottom">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route
            path="/goals"
            element={<ComingSoonPage title="Goals" phase="Arriving in Phase 3." />}
          />
          <Route
            path="/partner"
            element={<ComingSoonPage title="Partner" phase="Arriving in Phase 3." />}
          />
          <Route
            path="/points"
            element={<ComingSoonPage title="Points" phase="Arriving in Phase 5." />}
          />
          <Route
            path="/planner"
            element={<ComingSoonPage title="Planner" phase="Arriving in Phase 7." />}
          />
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
