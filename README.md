# mogging

A private goals & habits tracker for two people. Installed as a PWA on both
phones — no App Store, no public sign-up, no marketing site.

See [SETUP.md](./SETUP.md) for the full step-by-step setup and deploy guide.

## Stack

- Vite + React + TypeScript + Tailwind CSS
- Supabase (Postgres, Auth, Realtime)
- Vercel (hosting + serverless functions)
- `vite-plugin-pwa` for the installable app shell
- Web Push (VAPID) for notifications
- Groq (`llama-3.3-70b-versatile`) for the AI planner

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Build order

This app is being built in phases — see `SETUP.md` and commit history for
where things stand. Phase 1 is the installable app shell; later phases add
Supabase auth, goals, the year-grid heatmap, points/streaks, push
notifications, and the AI planner.
