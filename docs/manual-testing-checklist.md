# Manual testing checklist

Use a disposable Supabase project and two test accounts.

## Foundation and authentication

- [ ] `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` complete successfully.
- [ ] Missing Supabase environment shows a clear setup message and no data pages.
- [ ] Sign-up validates required fields; confirmation email returns to the app.
- [ ] Sign-in accepts a valid account; invalid credentials show a friendly error.
- [ ] Sign-out removes the local Auth session.
- [ ] Forgot-password mail links to the reset form; password update permits a new sign-in.
- [ ] Protected routes redirect signed-out users to sign-in.

## Onboarding and persistence

- [ ] New user profile, default policy, assignment, and notification preferences are created.
- [ ] Onboarding defaults to 3 days, Tue–Thu preferred, Mon–Fri eligible, Toronto timezone, and final-Monday rule.
- [ ] Preferred days cannot include ineligible weekdays; invalid timezones are rejected.
- [ ] Settings updates profile, location, active policy version, and reminder preferences.
- [ ] Attendance remains after sign-out, browser storage clearing, and sign-in on another device.

## Attendance, reporting, and calendar

- [ ] Three office days complete the weekly target; “You can chill” is not shown early.
- [ ] Monday/Friday count when enabled; preferred days only affect recommendation.
- [ ] Remote/not-in-office events do not count as attendance.
- [ ] Absence and holiday are credited once only when eligible and enabled; a week with 2 office days + 1 approved absence shows 3/3 and "You can chill". With the Settings toggles off, the same week shows 2/3.
- [ ] Final Monday is assigned to the ending reporting month and preceding reporting week; following reporting cycle starts Tuesday.
- [ ] Calendar keyboard arrows move one day or one week; status has text as well as color.
- [ ] Manual entries/absences/holidays can be edited/deleted with confirmation; imported attendance is read-only.

## Supporting features

- [ ] History filters and pagination query the server; empty state appears with no rows.
- [ ] CSV import previews data, shows invalid rows, rejects files over 2 MB or 1,000 rows, skips duplicate IDs, and records batch counts.
- [ ] In-app notifications appear once per reporting period and can be marked read.
- [ ] With email reminders on, a manual **Send office reminders** run emails the weekly plan / evening-before reminder / after-office check-in once and a second run sends nothing new.
- [ ] Account deletion requires confirmation and removes the account's data.

## Security

- [ ] Run the two-user RLS verification in [Security and RLS](security-and-rls.md).
- [ ] Authenticated User A cannot read or modify User B's profile or records by changing request IDs.
- [ ] Imported events cannot be updated/deleted by their owner.
- [ ] No frontend bundle or repository file contains a service-role key.

