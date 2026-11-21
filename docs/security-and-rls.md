# Security and Row Level Security

## Client boundary

The browser uses only `VITE_SUPABASE_URL` and the public anon key. These are public build-time values. Never expose a service-role key. All application tables have RLS enabled; policies scope personal records to `auth.uid()`. The repository always supplies an authenticated user ID for inserts, and RLS independently checks it.

Imported attendance is selectable by its owner but not updatable/deletable by an authenticated client. CSV imports go through the authenticated-user-scoped import RPC; direct inserts can create only manual events. The database trigger also rejects direct changes to imported events. Manual records can be edited/deleted. Administrative corrections must link to an event belonging to the same user. The account deletion function can cascade through imported records while direct user edits remain blocked.

Organization-owned locations, policies, and holidays are readable only by organization members. Membership checks use a narrowly scoped `SECURITY DEFINER` helper to avoid recursive RLS evaluation. Organization write/admin flows are not implemented in the MVP.

## RLS verification

Use a disposable Supabase project with two confirmed users. Add one attendance event for each account. In SQL Editor, switch to `authenticated` and set a test JWT subject:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_A_UUID', true);

select count(*) as other_user_rows
from public.attendance_events
where user_id = 'USER_B_UUID';
-- Must be 0.

select count(*) as own_rows
from public.attendance_events
where user_id = 'USER_A_UUID';
-- Must include User A's records.
rollback;
```

Repeat with A and B reversed. Check the same isolation for `profiles`, `approved_absences`, `holidays`, `notification_log`, and `import_batches`. A direct REST request made with User A's access token and a filter for User B must also return no User B rows. Do not use a service-role token for this test.

## Database checks

The migration has check constraints for status, role, owner, weekday, date-range, and count domains. Verify these in a disposable project by attempting invalid values as an authorized test user; each statement should fail. Verify imported external-event uniqueness by inserting the same `(user_id, source, external_event_id)` twice and confirming the second insert is rejected or ignored by the importer.

For database-level constraint checks, run as the SQL Editor's database owner in a disposable project and replace the UUID with a real test user's ID:

```sql
begin;
insert into public.attendance_events (user_id, event_date, status)
values ('TEST_USER_UUID', current_date, 'not-a-status');
-- Must fail: invalid enum value.
rollback;

begin;
insert into public.user_policy_assignments (user_id, policy_id, effective_from, effective_to)
select 'TEST_USER_UUID', id, current_date, current_date - 1
from public.attendance_policies
where user_id = 'TEST_USER_UUID'
limit 1;
-- Must fail: invalid effective date range.
rollback;
```

For foreign-key behavior, create a valid policy, then attempt an assignment for a nonexistent user UUID using that policy ID; it must fail the `user_id` foreign key. When an account is deleted through the confirmed account-deletion flow, linked personal rows are removed by their `ON DELETE CASCADE` constraints.

The policy-update RPC is `SECURITY DEFINER`, validates the active user and date range, and changes only the caller's personal policy. The account-deletion RPC deletes only `auth.uid()`; its confirmation explains the cascade before invocation.

Migration `202611200003_account_deletion_audit.sql` prevents cascade-deletion triggers from inserting audit rows after their owning Auth user has been deleted. Ordinary record deletions still write audit entries while the account exists; account deletion removes its existing audit history.

## Privacy

The app stores only profile name/timezone/locale, office location label, user-entered attendance, absence and holiday information, policy preferences, in-app notifications, and import counts/identifiers needed for deduplication. It does not collect badge data, precise movement, IP addresses, or unrelated employee details. Imported organizational data may have separate retention requirements. Account deletion removes the user's linked application rows through foreign-key cascades; organizations may remain if they have other members.

