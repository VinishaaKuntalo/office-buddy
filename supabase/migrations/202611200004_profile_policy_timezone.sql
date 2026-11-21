create or replace function public.bootstrap_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_policy_id uuid;
  default_effective_from date;
begin
  insert into public.profiles (id, display_name, timezone, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    'America/Toronto',
    'en-CA'
  );

  select (now() at time zone profile.timezone)::date into default_effective_from
  from public.profiles profile where profile.id = new.id;

  insert into public.attendance_policies (user_id, name, effective_from)
  values (new.id, 'Default policy', default_effective_from)
  returning id into default_policy_id;

  insert into public.user_policy_assignments (user_id, policy_id, effective_from)
  values (new.id, default_policy_id, default_effective_from);

  insert into public.notification_preferences (user_id)
  values (new.id);
  return new;
end;
$$;

revoke all on function public.bootstrap_new_user() from public, anon, authenticated;

-- Repair untouched default setups, not completed onboarding or policy history.
with candidates as (
  select assignment.id, assignment.policy_id,
    (assignment.created_at at time zone profile.timezone)::date as local_date
  from public.user_policy_assignments assignment
  join public.profiles profile on profile.id = assignment.user_id
  join public.attendance_policies policy on policy.id = assignment.policy_id
  where not profile.onboarding_completed
    and policy.user_id = profile.id
    and policy.organization_id is null
    and policy.name = 'Default policy'
    and assignment.effective_to is null
    and policy.effective_to is null
    and assignment.effective_from = policy.effective_from
    and assignment.effective_from = (assignment.created_at at time zone 'UTC')::date
    and assignment.effective_from > (assignment.created_at at time zone profile.timezone)::date
    and not exists (
      select 1 from public.user_policy_assignments other
      where other.user_id = assignment.user_id and other.id <> assignment.id
    )
), repaired as (
  update public.user_policy_assignments assignment
  set effective_from = candidates.local_date
  from candidates where assignment.id = candidates.id
  returning candidates.policy_id, candidates.local_date
)
update public.attendance_policies policy
set effective_from = repaired.local_date
from repaired where policy.id = repaired.policy_id;
