-- Run as the database owner in a disposable project. All changes roll back.
begin;
do $$
declare
  test_user_id uuid := gen_random_uuid();
  test_event_id uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (test_user_id, test_user_id::text || '@example.com', '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', test_user_id::text, true);

  insert into public.attendance_events (user_id, event_date, status, source)
  values (test_user_id, current_date, 'in_office', 'manual')
  returning id into test_event_id;
  delete from public.attendance_events where id = test_event_id;
  if not exists (
    select 1 from public.audit_log
    where user_id = test_user_id and entity_id = test_event_id and action = 'delete'
  ) then
    raise exception 'Ordinary attendance deletion must be audited.';
  end if;

  insert into public.attendance_events (user_id, event_date, status, source)
  values (test_user_id, current_date, 'in_office', 'csv_import');
  insert into public.approved_absences (user_id, start_date, end_date)
  values (test_user_id, current_date, current_date);

  perform public.delete_my_account();
  if exists (select 1 from auth.users where id = test_user_id)
    or exists (select 1 from public.profiles where id = test_user_id)
    or exists (select 1 from public.attendance_events where user_id = test_user_id)
    or exists (select 1 from public.approved_absences where user_id = test_user_id)
    or exists (select 1 from public.attendance_policies where user_id = test_user_id)
    or exists (select 1 from public.user_policy_assignments where user_id = test_user_id)
    or exists (select 1 from public.audit_log where user_id = test_user_id) then
    raise exception 'Account deletion must remove the user and linked data.';
  end if;
  raise notice 'PASS: ordinary deletes are audited and account deletion cascades.';
end;
$$;
rollback;
