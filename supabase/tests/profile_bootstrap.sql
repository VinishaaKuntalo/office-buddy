-- Run as the database owner; exercises the UTC/local-day boundary when present.
begin;
do $$
declare
  test_user_id uuid := gen_random_uuid();
  user_today date;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (test_user_id, test_user_id::text || '@example.com', '{}'::jsonb);
  select (now() at time zone timezone)::date into user_today
  from public.profiles where id = test_user_id;
  if not exists (
    select 1 from public.user_policy_assignments assignment
    join public.attendance_policies policy on policy.id = assignment.policy_id
    where assignment.user_id = test_user_id and policy.user_id = test_user_id
      and assignment.effective_from = user_today
      and policy.effective_from = user_today
  ) then
    raise exception 'Bootstrap policy and assignment must start on the profile-local date.';
  end if;
  raise notice 'PASS: bootstrap policy is active on the profile-local date.';
end;
$$;
rollback;
