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

## 7. Set up reliable email delivery (Brevo)

Supabase's built-in email sender is capped at **2 emails per hour**, and on
newer projects it only delivers to your own team's addresses. Fine to
discover once, not fine to actually use. Auth emails need to go through a
real sending service.

> **Why not Resend?** It's a good service, but its free tier will only
> deliver to the address you signed up with until you verify a **domain you
> own**. That's invisible while you're testing on yourself, and then the
> second person you invite can never sign in: their request is rejected
> before an email is created, and Supabase reports it as a generic 500. If
> you own a domain, Resend is a fine choice. If you don't, use Brevo, which
> verifies a single **email address** instead.

1. Sign up at [brevo.com](https://www.brevo.com). The free tier sends 300
   emails a day, which is far more than two people signing in ever needs.
2. Verify the address you'll send from. Go to **Senders, Domains &
   Dedicated IPs → Senders → Add a sender**, enter your own email, and click
   the link Brevo emails you.
3. Get the SMTP credentials: click your account name (top right) → **SMTP &
   API** → the **SMTP** tab. You need two values from this page:
   - **Login** — an address ending in `@smtp-brevo.com`. This is *not* your
     account email, and it's the single most common thing to get wrong here.
   - **SMTP key** — click **Generate a new SMTP key** and copy it
     immediately.
4. In Supabase: **Authentication → Emails → SMTP Settings**.
5. Toggle **Enable custom SMTP** on and fill in:
   - **Sender email**: the address you verified in step 2
   - **Sender name**: `mogging`
   - **Host**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Username**: the `@smtp-brevo.com` login from step 3
   - **Password**: the SMTP key from step 3
6. Click **Save changes**.

> **If the first email lands in spam**, that's the sender address. Sending
> from a `@gmail.com` or `@outlook.com` address is allowed, but those
> providers publish rules saying only they should send as themselves, so
> strict receivers (iCloud especially) treat it with suspicion. It usually
> still arrives, just in the spam folder. Marking it "not spam" once is
> normally enough. Verifying a domain you own is the permanent fix.
6. Now go to **Authentication → Emails → Templates**, open the **Magic
   Link** template, and make sure the body includes `{{ .Token }}` somewhere
   visible (this is the 6-digit code) — not just `{{ .ConfirmationURL }}`.
   If it's missing, add a line like:

   ```html
   <h2>Your code: {{ .Token }}</h2>
   ```

   This matters because tapping the emailed link opens **Safari**, not your
   installed home-screen app, and iOS keeps those two completely separate —
   a session started in Safari never reaches the installed app. Typing the
   6-digit code directly into the app (which the app's Login screen supports)
   sidesteps that entirely.

## 8. Get your API keys

1. Go to **Project Settings** (gear icon) → **API Keys**.
2. Copy the **Project URL** — check under **Data API** in the same settings
   section if it's not shown alongside the keys. It looks like
   `https://xxxxxxxx.supabase.co` — nothing after `.supabase.co`, no
   `/rest/v1` or other path on the end.
3. Copy the **Publishable key** (starts with `sb_publishable_...`) — **not**
   the **Secret key** (`sb_secret_...`), that one must never leave this
   dashboard.

## 9. Add the environment variables to Vercel

1. Go to your project on [vercel.com](https://vercel.com), then **Settings →
   Environments → Production** (Vercel recently moved env vars under each
   environment rather than a standalone tab).
2. Add:
   - `VITE_SUPABASE_URL` = the Project URL from Step 8
   - `VITE_SUPABASE_ANON_KEY` = the Publishable key from Step 8
3. Turn **Sensitive off** for both (they're safe to expose in the browser,
   and leaving it off means you can still view them later if needed).
4. Click **Save**.
5. Go to the **Deployments** tab, open the three-dot menu on the latest
   deployment, and click **Redeploy** so the new variables take effect.

## 10. Sign in and pair your accounts

1. Open the app on your phone (from the home screen icon).
2. Enter your email, tap **Send sign-in code**.
3. Check your email for a 6-digit code, then type it directly into the app
   and tap **Verify code** — no need to tap anything in the email itself.
4. Go to **Settings**. You'll see a 6-character invite code — send it to her
   (text, whatever).
5. Have her open the same Vercel URL, install it the same way (Phase 1,
   step 2), sign in with her email the same way (code, not link), go to
   Settings, and enter your code in the **"Or enter her code"** field.
6. You should now both see "Paired with ..." on the Settings screen.

If her sign-in fails with "This app is invite-only," double check her exact
email address matches what you put in Step 5 — it's an exact match
(case-insensitive, but no typos).

## 11. Run the Phase 3 migration

Phase 3 adds server-side points calculation (a Postgres trigger, so points
are never computed in the browser). One more migration file to run:

1. In Supabase, open **SQL Editor → New query**.
2. Copy the contents of `supabase/migrations/20260726000000_points_and_tasks.sql`
   from the repo and paste it in.
3. Click **Run**. Should say "Success."

That's it — no new env vars or dashboard settings for this one.

Phase 4 (the year-grid heatmap) needed no new migration — it's built entirely
on tables from earlier phases.

## 12. Run the Phase 5 migration

Phase 5 adds streak bonuses, levels, and the real Points screen.

1. In Supabase, open **SQL Editor → New query**.
2. Copy the contents of
   `supabase/migrations/20260727000000_streaks_levels_points.sql` from the
   repo and paste it in.
3. Click **Run**. Should say "Success."

This one also does a one-time backfill of `profiles.points_total` /
`current_level` from whatever tasks and goal logs already exist, so testing
you've done in earlier phases gets reflected immediately instead of starting
from zero.

## 13. Run the points-stats migration

Adds the history + summary functions behind the graph, badges, and records
on the Points screen.

1. In Supabase, open **SQL Editor → New query**.
2. Copy the contents of `supabase/migrations/20260728000000_points_stats.sql`
   from the repo and paste it in.
3. Click **Run**. Should say "Success."

**Run step 12 first** — this migration builds on the triggers that one
creates. It also re-runs the totals resync at the end, so if points ever
look wrong or stuck at zero, re-running just this file is the repair hatch.

> If the Points screen shows "Points stats are unavailable," it means this
> migration hasn't been run yet.

## 14. Run the benchmarks migration

Adds benchmarks — target numbers you're working toward (a sub-7:30 mile, a
225 bench, a goal weight), separate from the daily habits that move them.

1. In Supabase, open **SQL Editor → New query**.
2. Copy the contents of `supabase/migrations/20260729000000_benchmarks.sql`
   from the repo and paste it in.
3. Click **Run**. Should say "Success."

Run steps 12 and 13 first. This one also updates the points functions so
benchmark achievements count toward your totals, and re-runs the resync.

## 15. Run the notifications migration

1. In Supabase, open **SQL Editor → New query**.
2. Copy the contents of
   `supabase/migrations/20260730000000_notifications.sql` and paste it in.
3. Click **Run**.

## 16. Generate your VAPID keys

VAPID is the keypair that proves push messages genuinely came from your app.
You generate it once and never change it (changing it invalidates every
existing subscription).

On your computer, in the project folder:

```bash
npm install
node scripts/generate-vapid.mjs
```

It prints four values. Keep that terminal open for the next step.

> No terminal handy? You can generate keys at
> [vapidkeys.com](https://vapidkeys.com) instead — it runs in the browser.
> Use the "Public Key" and "Private Key" it gives you.

## 17. Add the notification environment variables to Vercel

Go to Vercel → **Settings → Environments → Production** and add:

| Key | Value | Sensitive? |
| --- | --- | --- |
| `VITE_VAPID_PUBLIC_KEY` | the public key | No |
| `VAPID_PUBLIC_KEY` | the same public key again | No |
| `VAPID_PRIVATE_KEY` | the private key | **Yes** |
| `VAPID_SUBJECT` | `mailto:brutdogjr09@gmail.com` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_…`) | **Yes** |
| `CRON_SECRET` | any long random string you make up | **Yes** |

For `CRON_SECRET`, just mash out something long and random — it's a password
shared between GitHub and Vercel so nobody else can trigger your reminders.

Then **Deployments → ⋯ → Redeploy**.

> The public key appears twice on purpose: the browser needs it to subscribe
> (`VITE_` prefix), and the server needs it to sign (no prefix). The private
> key exists only on the server and is never sent to the browser.

## 18. Set up the reminder cron in GitHub

1. Go to your repo on GitHub → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** twice:
   - `APP_URL` = your Vercel URL, no trailing slash (e.g.
     `https://t-and-t-goals.vercel.app`)
   - `CRON_SECRET` = the exact same value you put in Vercel
3. Go to the **Actions** tab. If prompted, enable workflows.
4. Find **Reminders** in the sidebar and click **Run workflow** to test it
   now rather than waiting. A green check means it worked.

This runs every 15 minutes. It sends daily reminders at each person's chosen
local time, delivers nudges that were held during quiet hours, and keeps the
Supabase project awake (free projects auto-pause after 7 days idle).

## 19. Turn on notifications

On your phone, in the installed app: **Settings → Notifications → Turn on
notifications**, and accept the system prompt.

If you see "Add to Home Screen first" instead of a button, the app is open in
a Safari tab rather than from the Home Screen icon. iPhone only allows
notifications for installed apps (iOS 16.4+, and not in the EU).

While you're there, set your **daily reminder** time and **quiet hours**. A
nudge sent during her quiet hours is held and delivered when they end — never
dropped.

## 20. Get a Groq API key (for the AI planner)

1. Go to [console.groq.com](https://console.groq.com) and sign up (free —
   Google/GitHub sign-in works).
2. In the left sidebar click **API Keys** → **Create API Key**.
3. Name it anything, click Submit, and **copy the key immediately**
   (starts with `gsk_`) — Groq won't show it again.
4. In Vercel → **Settings → Environments → Production**, add:
   - `GROQ_API_KEY` = the key you copied
5. **Deployments → ⋯ → Redeploy**.

Groq's free tier is roughly 30 requests per minute and about 1,000 per day
for the whole account. Two people generating the occasional plan won't come
close. If you ever do hit it, the app shows a "give it a minute" message
rather than an error page.

> The key lives only in Vercel's server-side environment. It is never sent
> to the browser — the app calls your own `/api/plan` endpoint, which calls
> Groq on the server.

## 21. Run the task-notes migration

The planner writes detailed instructions (the actual lifts, distances, or
prep steps) alongside each habit, which needs one more column.

1. Supabase → **SQL Editor → New query**.
2. Paste and **Run**:

   ```sql
   alter table public.task_templates add column if not exists notes text;
   alter table public.tasks add column if not exists notes text;
   ```

## 22. Run the polish migrations

Two more files, in this order. Same routine each time: Supabase →
**SQL Editor → New query** → paste the whole file → **Run**.

1. `supabase/migrations/20260802000000_points_records.sql` — adds the
   "days in a row" and "goal completion %" records to the Points screen.
2. `supabase/migrations/20260803000000_reminders_and_goal_sync.sql` — lets
   you set several daily reminders instead of just one, and makes a goal
   cross itself off only once **every** task linked to it that day is done.

The second one carries your existing single reminder time over
automatically, so you won't lose the reminder you already had.

## What's next

Phase 8 is polish: offline caching, animation passes, and any rough edges
you've spotted along the way.

## Notes on `npm audit`

You may notice `npm audit` reports some "high severity" issues. As of this
write-up they're all in build-time tooling (`vite-plugin-pwa`'s icon/service
worker generator, which we don't run in the browser) or in a React Router
mode we don't use (server-side rendering). None of them affect the deployed
app, but it's worth running `npm audit` again occasionally and upgrading
when fixes land.
