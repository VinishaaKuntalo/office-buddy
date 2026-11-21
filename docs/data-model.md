# Data model

All dates representing attendance, absence, holidays, or effective policy ranges are PostgreSQL `date` values. User-entered profile timezone is an IANA timezone string. IDs are UUIDs except where an external provider supplies a separate external ID.

## Tables

- `profiles`: one row per `auth.users.id`; display name, timezone, locale, onboarding state.
- `organizations`, `organization_members`: future group ownership and membership roles.
- `office_locations`: personal or organization-owned office names and timezones.
- `attendance_policies`: typed primary policy settings, weekday arrays, absence/holiday adjustments, boundary rule, and effective range.
- `user_policy_assignments`: date-bounded mapping of a user to a policy.
- `attendance_events`: raw date/status/source event, source ID/metadata, notes, and optional correction link.
- `approved_absences`: approved date range and source.
- `holidays`: user or organization holiday date/name/source.
- `notification_preferences`, `notification_log`: in-app delivery preferences and deduplicated notices.
- `import_batches`: inserted/skipped/rejected CSV counts.
- `audit_log`: significant event, absence, holiday, and policy mutations.

The first user policy is created by the `auth.users` after-insert trigger. It has a three-day target, preferred Tuesday–Thursday, eligible Monday–Friday, both adjustment toggles enabled, the configured month-end rule, Toronto timezone, and `en-CA` profile locale. Weekend eligibility can be edited.

The bootstrap policy and assignment start on the profile-local calendar date, not the database's UTC date. Migration `202611200004_profile_policy_timezone.sql` also repairs unfinished, single-default-policy setups affected by the old UTC boundary without rewriting completed onboarding or versioned policy history.

## Important constraints

- Attendance sources/statuses and organization roles are PostgreSQL enums.
- Event/absence/holiday source IDs are unique per owning user or organization and source when present.
- Required days are 0–7; weekday arrays use JavaScript numbering (`0=Sunday` through `6=Saturday`).
- Absence ranges and policy effective ranges cannot end before they start.
- Personal rows have a `user_id`; organization rows have an `organization_id`; the owner check prevents ambiguous ownership.
- `attendance_events` is raw source data. CSV events can be created only through the authenticated-user-scoped import RPC. Imported events are read-only through authenticated user policies and a database trigger; administrative corrections are separate events linked to an original event belonging to the same user.
- `updated_at` triggers keep mutable rows current. Audit triggers record significant data changes.

## Date dimensions

The database stores the actual `event_date` and policy effective dates; it does not persist calculated month/week buckets. The rules engine derives `calendarWeek`, `reportingWeek`, `calendarMonth`, and `reportingMonth`, preserving the raw date. See [Rules engine](rules-engine.md).

