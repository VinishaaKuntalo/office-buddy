# Architecture

## Runtime shape

Office Buddy is a static single-page React application built with Vite. `HashRouter` keeps navigation compatible with GitHub Pages and Cloudflare Pages without a server-side rewrite. React components own presentation and interaction; Supabase access is kept in `src/data/repository.ts`; domain rules are pure functions under `src/rules/`.

Calendar, insights, history, import, notifications, privacy, and settings load through React lazy route components with a loading status. React and Supabase dependencies are separate vendor chunks; splitting improves caching and defers secondary pages, but does not remove dependencies from the total download.

```text
React pages/components
        | repository functions
        v
Supabase Auth + public anon key
        |
        v
PostgreSQL tables + RLS + database triggers
```

The public anon key is expected to be visible in the static build. Authorization is enforced by Postgres RLS. Never put a service-role key in the browser or CI build variables.

## Source layout

- `src/auth/`: Supabase session lifecycle and authentication form.
- `src/components/`: reusable UI, application navigation, and date-entry dialog.
- `src/data/`: typed data-access/repository functions.
- `src/hooks/`: authenticated workspace loading and refresh.
- `src/lib/`: Supabase client and date/time helpers.
- `src/pages/`: landing, onboarding, dashboard, calendar, insights, history, import, notifications, and settings.
- `src/rules/`: independently testable attendance/reporting calculations and Vitest cases.
- `src/types/`: application domain and Supabase database types.
- `supabase/migrations/`: normalized database, triggers, and RLS.
- `docs/`: data, rules, security, and manual verification guidance.

## Persistence

PostgreSQL is the source of truth. The official Supabase client persists only its authentication session as needed. UI state and derived progress are transient. Clearing browser storage may require signing in again; it must not remove attendance or settings from the database.

Raw events remain separate from weekly/monthly calculations. Current summaries are computed on the client after fetching indexed, bounded date ranges. Attendance history uses server-side filtering and pagination. If scale later warrants caching, cached summaries must remain rebuildable from immutable source events and calculations must be idempotent.

## Deployment and free-tier boundaries

GitHub Pages is the primary static host. Cloudflare Pages is a documented alternative. Supabase supplies auth and PostgreSQL. There are no queues, containers, or paid APIs. In-app status notifications are inserted with a user-scoped unique deduplication key when the dashboard is visited. Optional email reminders run from an hourly GitHub Actions workflow (`scripts/send-reminders.ts`) that uses the shared rules engine through `src/reminders/planner.ts`, reads with a service-role key held only as a GitHub secret, claims a unique `notification_log` key, then sends through Resend's free tier.

Free tiers have changing quotas, may pause inactive projects, and are not an unlimited production capacity commitment. Check provider terms before use at higher volume.

## Integration extension points

- Badge/CSV/HR/Outlook sources: ingest into immutable `attendance_events` with source and external ID.
- Corrections: add a new `admin_correction` event linked to its original `corrects_event_id`; do not mutate imported records.
- Organization management: extend membership-scoped RLS with explicit admin/owner write policies and organization assignment workflows.
- Holiday providers: write user- or organization-scoped rows to `holidays`.
- Scheduled notifications: add a trusted server/edge job only after choosing a reliable hosting plan; never put service credentials in the client.
- Cached summaries: add a rebuildable projection keyed by user, period, and policy version; do not make it the source of truth.

