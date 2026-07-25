# Setup Guide

Written so you can follow it with zero prior deployment experience. Do the
steps in order. This file grows as we finish each build phase — right now it
only covers **Phase 1: getting the app installed on your phone**.

## What you need before starting

- A free [GitHub](https://github.com) account (you already have the repo:
  `t06726495-afk/T-and-T-goals`)
- A free [Vercel](https://vercel.com) account — sign up with **"Continue with
  GitHub"** so it can see your repos without extra setup
- A phone (iPhone or Android) to test the install on

## 1. Create a Vercel project from the repo

1. Go to [vercel.com/new](https://vercel.com/new).
2. Click **"Continue with GitHub"** if you're not signed in yet, and
   authorize Vercel to access your GitHub account.
3. On the "Import Git Repository" screen, find `T-and-T-goals` in the list
   and click **Import**. (If you don't see it, click **"Adjust GitHub App
   Permissions"** and grant Vercel access to that repo.)
4. Vercel will auto-detect this as a **Vite** project. Leave the defaults:
   - Build Command: `npm run build` (auto-filled)
   - Output Directory: `dist` (auto-filled)
   - Install Command: `npm install` (auto-filled)
5. Skip "Environment Variables" for now — nothing is required yet in Phase 1.
   We'll come back to this box in Phase 2.
6. Click **Deploy**. Wait ~1 minute for the build to finish.
7. When it says "Congratulations," click **Continue to Dashboard**, then
   click the preview screenshot (or **Visit**) to open the live URL. It'll
   look like `https://t-and-t-goals-xxxx.vercel.app`.

From now on, every time we push a commit to the `claude/couples-tracker-pwa-mifa3f`
branch, Vercel will redeploy automatically — you don't need to repeat these
steps.

> Once we merge to `main` later, Vercel will treat that as your production
> URL. Until then, use the "preview" URL Vercel gives you for this branch —
> it's the same app.

## 2. Install it on your phone

### iPhone (Safari only — this matters)

1. Open the Vercel URL in **Safari** (not Chrome, not a link opened inside
   Instagram/Messages — it must be Safari itself).
2. Tap the **Share** icon (square with an arrow) in the toolbar.
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top right.
5. Open the app from the icon on your Home Screen (not the Safari tab) —
   this is what makes it behave like a real app instead of a website.

### Android (Chrome)

1. Open the Vercel URL in Chrome.
2. Tap the **⋮** menu in the top right.
3. Tap **Add to Home screen** (or you may see an **Install app** banner —
   tap that instead).
4. Confirm, then open the app icon from your home screen.

### How to confirm it worked

Open the app from the home screen icon (not the browser). You should see:

- No browser address bar or tab strip — it fills the whole screen.
- A green ✅ **"Installed — you're running this as a standalone app"** card
  on the home page. If you instead see the "Install this app" instructions,
  it opened as a regular browser tab — go back and open it from the home
  screen icon, not from Safari/Chrome directly.

## What's next

Phase 2 adds Supabase (the database + login) and updates this guide with:
account creation, running the SQL migration, setting the two allowed email
addresses, generating and setting environment variables, and how to pair
your two accounts.

## Notes on `npm audit`

You may notice `npm audit` reports some "high severity" issues. As of this
write-up they're all in build-time tooling (`vite-plugin-pwa`'s icon/service
worker generator, which we don't run in the browser) or in a React Router
mode we don't use (server-side rendering). None of them affect the deployed
app, but it's worth running `npm audit` again occasionally and upgrading
when fixes land.
