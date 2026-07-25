# Setup Guide

Written so you can follow it with zero prior deployment experience. Do the
steps in order. This file grows as we finish each build phase — it now
covers **Phase 1 (install) and Phase 2 (database + login + pairing)**.

## What you need before starting

- A free [GitHub](https://github.com) account (you already have the repo:
  `t06726495-afk/T-and-T-goals`)
- A free [Vercel](https://vercel.com) account — sign up with **"Continue with
  GitHub"** so it can see your repos without extra setup
- A free [Supabase](https://supabase.com) account — sign up with **"Continue
  with GitHub"** too (needed starting in Phase 2)
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

## 3. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and sign in
   with GitHub.
2. Click **New project**.
3. Pick an organization (Supabase creates a personal one by default), name
   the project (e.g. `mogging`), and set a **database password** — click the
   dice icon to generate a strong one and **save it somewhere** (a notes app
   is fine; you won't need it day-to-day, but keep it in case you ever need
   direct database access).
4. Pick the region closest to you and her.
5. Click **Create new project**. Wait 1–2 minutes for it to finish
   provisioning.

## 4. Run the database migration

1. In the Supabase dashboard, open your project, then click **SQL Editor**
   in the left sidebar.
2. Click **New query**.
3. Open `supabase/migrations/20260725000000_init.sql` from the repo (on
   GitHub, browse to that path and click the file, or use the "raw" view),
   select all, and copy it.
4. Paste the entire file into the SQL Editor.
5. Click **Run** (or press Ctrl+Enter). It should say "Success. No rows
   returned." If you get an error, stop and paste the exact error back to
   me — don't re-run partial edits.

This creates every table, all the row-level-security policies, the pairing
functions, and the signup-allowlist trigger.

## 5. Lock signup to your two emails

The trigger from the migration checks new signups against a small table
(`allowed_emails`) that's locked down so the app itself can never read or
write it — only you, from the SQL Editor. Seed it with your two addresses:

1. Still in the **SQL Editor**, open another **New query**.
2. Paste this exactly (already has your two emails filled in):

   ```sql
   insert into public.allowed_emails (email) values
     ('brutdogjr09@gmail.com'),
     ('taylormagee10@icloud.com');
   ```

3. Click **Run**.

Only these two addresses will ever be able to create an account — anyone
else who finds the URL and tries to sign in gets a clean "This app is
invite-only" message instead of an account.

> If you ever need to add, remove, or change an email later:
> `insert into public.allowed_emails (email) values ('new@example.com');` to
> add one, or `delete from public.allowed_emails where email = 'old@example.com';`
> to remove one.

## 6. Turn on magic-link email auth

1. In the left sidebar, go to **Authentication → Sign In / Providers**.
2. Confirm the **Email** provider is enabled (it is by default) — you don't
   need a password provider, we're using magic links (OTP) only.
3. Go to **Authentication → URL Configuration**.
4. Set **Site URL** to your Vercel URL from Phase 1 (e.g.
   `https://t-and-t-goals-xxxx.vercel.app`).
5. Under **Redirect URLs**, add the same URL again (and later, add your real
   custom domain here too if you set one up).
6. Leave **"Allow new user signups"** turned ON — that global switch has to
   stay on for anyone to sign in at all; the allowlist trigger from Step 5 is
   what actually restricts it to just you two.

## 7. Get your API keys

1. Go to **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** (looks like `https://xxxxxxxx.supabase.co`).
3. Copy the **anon public** key (a long string starting with `eyJ...`) —
   **not** the `service_role` key, that one must never leave this dashboard.

## 8. Add the environment variables to Vercel

1. Go to your project on [vercel.com](https://vercel.com), then **Settings →
   Environment Variables**.
2. Add:
   - `VITE_SUPABASE_URL` = the Project URL from Step 7
   - `VITE_SUPABASE_ANON_KEY` = the anon public key from Step 7
3. Leave "Environments" set to all three (Production, Preview, Development).
4. Click **Save**.
5. Go to the **Deployments** tab, open the three-dot menu on the latest
   deployment, and click **Redeploy** so the new variables take effect.

## 9. Sign in and pair your accounts

1. Open the app on your phone (from the home screen icon).
2. Enter your email, tap **Send magic link**, then open the email and tap
   the link — it'll open the app and log you in.
3. Go to **Settings**. You'll see a 6-character invite code — send it to her
   (text, whatever).
4. Have her open the same Vercel URL, install it the same way (Phase 1,
   step 2), sign in with her email, go to Settings, and enter your code in
   the **"Or enter her code"** field.
5. You should now both see "Paired with ..." on the Settings screen.

If her sign-in fails with "This app is invite-only," double check her exact
email address matches what you put in Step 5 — it's an exact match
(case-insensitive, but no typos).

## What's next

Phase 3 adds real goals (checkbox and counter), the Today screen with daily
tasks, and the daily task-generation logic.

## Notes on `npm audit`

You may notice `npm audit` reports some "high severity" issues. As of this
write-up they're all in build-time tooling (`vite-plugin-pwa`'s icon/service
worker generator, which we don't run in the browser) or in a React Router
mode we don't use (server-side rendering). None of them affect the deployed
app, but it's worth running `npm audit` again occasionally and upgrading
when fixes land.
