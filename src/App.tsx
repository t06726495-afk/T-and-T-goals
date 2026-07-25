import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { TodayPage } from './pages/TodayPage'
import { ComingSoonPage } from './pages/ComingSoonPage'

function App() {
  return (
    <BrowserRouter>
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
          <Route
            path="/settings"
            element={<ComingSoonPage title="Settings" phase="Arriving in Phase 2." />}
          />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
