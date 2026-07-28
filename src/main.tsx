import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { watchForUpdates } from './lib/sw-update'

// Before React mounts, so an update found on launch reloads immediately
// rather than after the old UI has already painted.
watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
