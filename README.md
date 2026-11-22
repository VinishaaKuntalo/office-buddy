# Office Buddy

Office Buddy helps you see how many office days you have completed, what remains, how approved absences affect the target, and when you can chill. The frontend is a static React app; authenticated user records live in Supabase Postgres and are protected by Row Level Security (RLS).

## What is implemented

- Email/password sign-up, sign-in, email confirmation, password reset, and sign-out.
- Per-user profile, timezone, office location, versioned attendance policy, and reminder preference.
- Manual office/remote/not-in-office entries, approved absences, and holidays.
- Weekly status and recommendation. Approved absences and holidays on eligible weekdays count toward the weekly target (e.g. 2 office days + 1 sick day = 3/3); each can be turned off in Settings.
- Reporting-month and reporting-week assignment for the final Monday of a month.
- Responsive calendar, paginated history, settings, CSV preview/import, and in-app status notifications.
- Optional email reminders (weekly plan + evening-before nudges) sent by an hourly GitHub Actions job via Resend.
- PostgreSQL migrations with RLS, constraints, indexes, audit entries, and a per-user account bootstrap trigger.

Browser push, organization administration, and external attendance feeds are not part of this free MVP.

## Requirements

- Node.js 22 LTS (npm is included with Node.js).
- A Supabase project on a plan that meets your needs. The browser app only uses the public key; the service-role key is used solely by the optional reminder job as a GitHub Actions secret.
- Git for source control; GitHub account only if deploying with GitHub Pages.

Free-tier quotas and eligibility change over time. Check current Supabase and hosting terms before deployment. Supabase Free may pause inactive projects and has finite database, authentication, and egress quotas; it is intended here for one personal user, not unlimited production growth. If a project is paused, resume it in Supabase before signing in. GitHub Pages and Cloudflare Pages are static hosting options; neither runs scheduled server-side jobs for this app.

## 1. Install Node.js prerequisites

Install the current Node.js 22 LTS release from [nodejs.org](https://nodejs.org/). Restart the terminal after installation and verify:

```powershell
node --version
npm --version
```

On a Windows device where you cannot install software, download the official Node.js 22 Windows ZIP instead of the MSI, extract it to a folder you can write to, and add its `node-v22.x.x-win-x64` directory to the current PowerShell session's `PATH`. Verify the downloaded ZIP against the SHA-256 checksum published with that Node.js release before extracting it.

The GitHub Actions workflow uses Node 22 and `npm ci`.

## 2. Create and configure Supabase

1. Create a Supabase project using a free plan, and choose a database password you can store securely.
2. In **Project Settings → API**, copy the project URL and the **publishable/anon public key**. Never use a `service_role` or secret key in this frontend.
3. In **Authentication → URL Configuration**, set the site URL to your deployed URL (or `http://localhost:5173/` for local work) and add the corresponding redirect URLs. For GitHub Pages, include the full project path, e.g. `https://USERNAME.github.io/office-buddy/`.
4. Email/password authentication and email confirmation are supported. Configure email delivery in Supabase if you need non-default delivery limits.

If sign-up returns HTTP 429 or `email rate limit exceeded`, stop retrying and allow the provider limit to reset. Check email confirmation and SMTP configuration in Supabase Authentication. Disabling confirmation is an option only for disposable testing, not a recommended production setting.

## 3. Apply PostgreSQL migrations

The default user policy and profile are created by the `auth.users` trigger after registration; `supabase/seed.sql` intentionally contains no shared demo users or personal records.

Run the Supabase CLI with `npx` (no global install is required), then from this repository:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Alternatively, run the SQL files in `supabase/migrations/` in filename order using the Supabase SQL Editor. Do not execute both methods against the same project. The migration history is the source of truth.

## 4. Configure environment variables

Copy the template:

```powershell
Copy-Item .env.example .env
```

Set:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Only the public anon key belongs in the frontend. The frontend is a static application, so Vite embeds these public settings in the build. RLS—not key secrecy—protects user data. Never add a Supabase service-role key to `.env`, GitHub variables, or browser code.

## 5. Install, run, test, and build

```powershell
npm ci
npm run dev
```

Open the Vite URL printed in the terminal. In another terminal:

```powershell
npm test
npm run typecheck
npm run build
npm run preview
```

The rules engine is pure TypeScript and can be tested without Supabase credentials. Authentication and data-backed pages need a configured project.

## 6. Create the first account

1. Open the app and choose **Create account**.
2. Confirm the email if confirmation is enabled, then sign in.
3. Complete onboarding: display name, IANA timezone, office location name, required days, preferred days, eligible weekdays, month-end rule, and reminder preference.
4. The default is three required days, Tuesday–Thursday preferred, Monday–Friday eligible, `America/Toronto`, `en-CA`, and the final-Monday reporting rule.
5. Add an office day from the dashboard or calendar. Add approved absence and holiday dates from the calendar.

The browser may retain the Supabase Auth session through the official Supabase client. Attendance, policies, preferences, absences, holidays, notifications, and calculated progress are read from Supabase; they are not stored in localStorage, sessionStorage, IndexedDB, or cookies as application data.

## 7. Verify PostgreSQL persistence

1. Add an attendance record and verify it appears after navigating away and returning.
2. In **Supabase → Table Editor → attendance_events**, filter `user_id` to the authenticated user ID. Confirm the row exists.
3. Sign out and sign in from another browser or device; the same record should be fetched from PostgreSQL.
4. Clearing browser cache/application data may sign you out, but must not delete database records. Sign in again to see them.

## 8. Verify Row Level Security

RLS is enabled on every user-data table. Create two test accounts, add an attendance row for each, and record their UUIDs. In Supabase SQL Editor, test the `authenticated` role (replace IDs):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_A_UUID', true);
select count(*) as visible_rows
from public.attendance_events
where user_id = 'USER_B_UUID';
-- Expected: 0
rollback;
```

Repeat with User B's UUID in the JWT claim and User A's UUID in the query. Also verify each account can read its own row. See [Security and RLS](docs/security-and-rls.md) for additional checks and authorization notes. Run these checks in a disposable test project.

## 9. Import sample CSV

Open **Import**, select [sample-attendance.csv](public/sample-attendance.csv), review the preview, and select **Import valid rows**. Required headers are `date,status`; optional headers are `notes,external_event_id`. Dates must be real ISO `YYYY-MM-DD` dates. Supported statuses are `in_office`, `approved_absence`, `holiday`, `remote`, and `not_in_office`. Files are limited to 2 MB and 1,000 rows. Imports are recorded in `import_batches`; repeated external IDs are skipped.

## 10. Deploy with GitHub Pages (primary)

The app uses `HashRouter`, so client-side routes work with static GitHub Pages hosting.

1. Push the repository to GitHub and use `main` as the deployment branch, or edit `.github/workflows/deploy.yml`.
2. In **Settings → Pages**, select **GitHub Actions** as the build and deployment source.
3. In **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (public key only)
4. Update Supabase Auth's site URL and redirect allowlist for `https://USERNAME.github.io/REPOSITORY/`.
5. Push to `main` or run **Deploy Office Buddy to GitHub Pages** manually. The workflow runs tests and a production build before publishing `dist/`.

For an organization/user Pages site served at the domain root, set Vite's `base` to `/` rather than `/office-buddy/` in `vite.config.ts`.

## Alternative deployment: Cloudflare Pages

1. Import the Git repository into Cloudflare Pages.
2. Set build command `npm ci && npm test && npm run build` and output directory `dist`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables (public anon key only).
4. For a root/custom domain, configure Vite `base: '/'`; for a project subpath, match that subpath.
5. Add the deployed URL to the Supabase Auth redirect allowlist. Hash-based routes need no server rewrite.

The static hosts run no background work. Email reminders run separately from GitHub Actions (see below).

## Email reminders (GitHub Actions + Resend)

[`.github/workflows/reminders.yml`](.github/workflows/reminders.yml) runs `npm run reminders` hourly. For every user with **Settings → Reminders → Email me office reminders** on, [`scripts/send-reminders.ts`](scripts/send-reminders.ts) evaluates the rules engine in the user's timezone and sends:

- **Weekly plan** at 08:00 on the first day of each reporting week (normally Monday; Tuesday after a month-end Monday) when office days are still needed, listing suggested dates (preferred weekdays first).
- **Evening-before reminder** at the user's reminder time on the day before each suggested office day.

Each reminder is claimed in `notification_log` with a unique `email:…` deduplication key before sending, so it also appears in-app and is never emailed twice. Setup:

1. Create a free [Resend](https://resend.com) account and an API key. Without a verified domain, Resend's `onboarding@resend.dev` sender can only deliver to the Resend account's own email, so sign up with the same email you use in Office Buddy (or verify a domain and set the `REMINDER_FROM_EMAIL` variable, e.g. `Office Buddy <reminders@yourdomain.com>`).
2. In the GitHub repo, **Settings → Secrets and variables → Actions → Secrets**, add `RESEND_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase **Project Settings → API keys → secret/service_role**). Never put the service-role key in `VITE_*` variables or the browser app.
3. Run **Send office reminders** once manually from the **Actions** tab with **Send a one-off test email** ticked; it should log `sent 1 emails` and the email should arrive.

GitHub may delay scheduled runs, and it disables schedules in public repos after 60 days without commits; re-enable from the Actions tab if that happens. The job without secrets exits successfully and does nothing.

## Troubleshooting

- **Missing Supabase configuration:** create `.env` from `.env.example` and restart Vite.
- **Auth redirects to the wrong page:** add the exact local/deployed base URL to Supabase Auth redirect URLs.
- **Email confirmation or reset link fails:** verify Supabase URL configuration and email settings; ensure the deployed hash URL is allowed.
- **Network/database unavailable:** check the Supabase project status and browser connection. Free projects may pause.
- **RLS denies a write:** check that the user is signed in, `user_id` is the authenticated UUID, and the migration set is fully applied.
- **Duplicate attendance:** review the calendar. Duplicate imported source IDs are skipped; manual dates can be edited in place.
- **Policy missing:** verify the auth-user bootstrap trigger exists and rerun onboarding after applying migrations.
- **CSV rejected:** use UTF-8 CSV with `date,status`, ISO dates, supported status values, and no more than 1,000 data rows / 2 MB.

## Documentation

- [Architecture and deployment boundaries](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Security and RLS](docs/security-and-rls.md)
- [Rules engine and boundary interpretation](docs/rules-engine.md)
- [Manual testing checklist](docs/manual-testing-checklist.md)

