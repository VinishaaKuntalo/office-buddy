drop policy if exists "Users manage their own attendance events" on public.attendance_events;
drop policy if exists "Users can view their imported attendance" on public.attendance_events;

create policy "Users view their attendance events"
  on public.attendance_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users create their own attendance events"
  on public.attendance_events for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'manual');
create policy "Users update their own manual attendance"
  on public.attendance_events for update to authenticated
  using (user_id = (select auth.uid()) and source = 'manual')
  with check (user_id = (select auth.uid()) and source = 'manual');
create policy "Users delete their own manual attendance"
  on public.attendance_events for delete to authenticated
  using (user_id = (select auth.uid()) and source = 'manual');

drop policy if exists "Users manage their own approved absences" on public.approved_absences;
create policy "Users view their own approved absences"
  on public.approved_absences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users create their own approved absences"
  on public.approved_absences for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'manual');
create policy "Users update their own manual approved absences"
  on public.approved_absences for update to authenticated
  using (user_id = (select auth.uid()) and source = 'manual')
  with check (user_id = (select auth.uid()) and source = 'manual');
create policy "Users delete their own manual approved absences"
  on public.approved_absences for delete to authenticated
  using (user_id = (select auth.uid()) and source = 'manual');

drop policy if exists "Users manage personal holidays" on public.holidays;
create policy "Users view their personal holidays"
  on public.holidays for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users create personal holidays"
  on public.holidays for insert to authenticated
  with check (user_id = (select auth.uid()) and organization_id is null and source = 'manual');
create policy "Users update their manual holidays"
  on public.holidays for update to authenticated
  using (user_id = (select auth.uid()) and source = 'manual')
  with check (user_id = (select auth.uid()) and organization_id is null and source = 'manual');
create policy "Users delete their manual holidays"
  on public.holidays for delete to authenticated
  using (user_id = (select auth.uid()) and source = 'manual');

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
  );
$$;

revoke all on function public.is_organization_member(uuid) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated;

drop policy if exists "Organizations are visible to their members" on public.organizations;
create policy "Organizations are visible to their members"
  on public.organizations for select to authenticated
  using (public.is_organization_member(id));

drop policy if exists "Members can view their organization membership" on public.organization_members;
create policy "Members can view their organization membership"
  on public.organization_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_organization_member(organization_id)
  );

drop policy if exists "Organization members view office locations" on public.office_locations;
create policy "Organization members view office locations"
  on public.office_locations for select to authenticated
  using (
    organization_id is not null
    and public.is_organization_member(organization_id)
  );

drop policy if exists "Organization members view organization policies" on public.attendance_policies;
create policy "Organization members view organization policies"
  on public.attendance_policies for select to authenticated
  using (
    organization_id is not null
    and public.is_organization_member(organization_id)
  );

drop policy if exists "Organization members view organization holidays" on public.holidays;
create policy "Organization members view organization holidays"
  on public.holidays for select to authenticated
  using (
    organization_id is not null
    and public.is_organization_member(organization_id)
  );

drop policy if exists "Users manage their own attendance policies" on public.attendance_policies;
create policy "Users view their own attendance policies"
  on public.attendance_policies for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users manage their own policy assignments" on public.user_policy_assignments;
create policy "Users view their own policy assignments"
  on public.user_policy_assignments for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.set_my_attendance_policy(
  p_required_days smallint,
  p_preferred_weekdays smallint[],
  p_eligible_weekdays smallint[],
  p_month_end_rule public.month_end_rule,
  p_effective_from date,
  p_name text default 'Personal policy'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assignment public.user_policy_assignments%rowtype;
  current_policy public.attendance_policies%rowtype;
  new_policy_id uuid;
  user_today date;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select (now() at time zone profile.timezone)::date into user_today
  from public.profiles profile
  where profile.id = auth.uid();
  if p_effective_from > user_today then
    raise exception 'Policy changes must take effect today or earlier.';
  end if;

  select * into current_assignment
  from public.user_policy_assignments assignment
  where assignment.user_id = auth.uid()
    and assignment.effective_from <= p_effective_from
    and (assignment.effective_to is null or assignment.effective_to >= p_effective_from)
  order by assignment.effective_from desc
  limit 1
  for update;

  if not found then
    select * into current_assignment
    from public.user_policy_assignments assignment
    where assignment.user_id = auth.uid()
    order by assignment.effective_from
    limit 1
    for update;
    if not found or p_effective_from >= current_assignment.effective_from then
      raise exception 'No policy assignment is active for this date.';
    end if;
    update public.user_policy_assignments
    set effective_from = p_effective_from
    where id = current_assignment.id;
    update public.attendance_policies
    set effective_from = p_effective_from
    where id = current_assignment.policy_id
      and user_id = auth.uid();
    current_assignment.effective_from := p_effective_from;
  end if;

  select * into current_policy
  from public.attendance_policies policy
  where policy.id = current_assignment.policy_id
    and policy.user_id = auth.uid()
    and policy.organization_id is null
  for update;

  if not found then
    raise exception 'Organization-assigned policies can only be changed by an organization administrator.'
      using errcode = '42501';
  end if;

  if current_assignment.effective_from = p_effective_from then
    update public.attendance_policies
    set required_days_per_week = p_required_days,
        preferred_weekdays = p_preferred_weekdays,
        eligible_weekdays = p_eligible_weekdays,
        month_end_rule = p_month_end_rule,
        name = p_name
    where id = current_policy.id;
    return current_policy.id;
  end if;

  update public.user_policy_assignments
  set effective_to = p_effective_from - 1
  where id = current_assignment.id;
  update public.attendance_policies
  set effective_to = p_effective_from - 1
  where id = current_policy.id;

  insert into public.attendance_policies (
    user_id, name, required_days_per_week, preferred_weekdays, eligible_weekdays,
    reduce_for_approved_absences, reduce_for_holidays, month_end_rule, effective_from
  )
  values (
    auth.uid(), p_name, p_required_days, p_preferred_weekdays, p_eligible_weekdays,
    current_policy.reduce_for_approved_absences, current_policy.reduce_for_holidays,
    p_month_end_rule, p_effective_from
  )
  returning id into new_policy_id;

  insert into public.user_policy_assignments (user_id, policy_id, effective_from)
  values (auth.uid(), new_policy_id, p_effective_from);

  return new_policy_id;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  delete from auth.users where id = current_user_id;
  if not found then
    raise exception 'Account not found.';
  end if;
end;
$$;

create or replace function public.import_attendance_csv(
  p_records jsonb,
  p_file_name text,
  p_rejected_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  item record;
  item_date date;
  inserted_count integer := 0;
  affected_count integer;
  input_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_records is null or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'CSV import records must be an array.';
  end if;
  if jsonb_array_length(p_records) > 1000 then
    raise exception 'CSV import must contain an array of at most 1000 valid records.';
  end if;
  if p_rejected_count is null or p_rejected_count < 0
    or p_file_name is null or char_length(p_file_name) not between 1 and 255 then
    raise exception 'Invalid CSV import metadata.';
  end if;

  input_count := jsonb_array_length(p_records);
  for item in
    select * from jsonb_to_recordset(p_records) as parsed(
      event_date text,
      status text,
      notes text,
      external_event_id text
    )
  loop
    if item.event_date !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'CSV dates must use YYYY-MM-DD format.';
    end if;
    item_date := item.event_date::date;
    if to_char(item_date, 'YYYY-MM-DD') <> item.event_date then
      raise exception 'CSV date is not a valid calendar date.';
    end if;
    if item.external_event_id is null or char_length(item.external_event_id) not between 1 and 2048 then
      raise exception 'Each imported record must have a valid external event ID.';
    end if;
    if char_length(coalesce(item.notes, '')) > 2000 then
      raise exception 'CSV notes cannot exceed 2000 characters.';
    end if;

    if item.status in ('in_office', 'remote', 'not_in_office') then
      insert into public.attendance_events (
        user_id, event_date, status, source, external_event_id, notes
      )
      values (
        current_user_id, item_date, item.status::public.attendance_status,
        'csv_import', item.external_event_id, coalesce(item.notes, '')
      )
      on conflict (user_id, source, external_event_id) do nothing;
    elsif item.status = 'approved_absence' then
      insert into public.approved_absences (
        user_id, start_date, end_date, reason, source, external_event_id
      )
      values (
        current_user_id, item_date, item_date, coalesce(item.notes, ''),
        'csv_import', item.external_event_id
      )
      on conflict (user_id, source, external_event_id) do nothing;
    elsif item.status = 'holiday' then
      insert into public.holidays (
        user_id, holiday_date, name, source, external_event_id
      )
      values (
        current_user_id, item_date, coalesce(nullif(item.notes, ''), 'Imported holiday'),
        'csv_import', item.external_event_id
      )
      on conflict (user_id, source, external_event_id) do nothing;
    else
      raise exception 'CSV contains an unsupported attendance status.';
    end if;

    get diagnostics affected_count = row_count;
    inserted_count := inserted_count + affected_count;
  end loop;

  insert into public.import_batches (
    user_id, file_name, inserted_count, skipped_count, rejected_count
  )
  values (
    current_user_id, p_file_name, inserted_count,
    input_count - inserted_count, p_rejected_count
  );

  return jsonb_build_object(
    'inserted', inserted_count,
    'skipped', input_count - inserted_count,
    'rejected', p_rejected_count
  );
end;
$$;

revoke all on function public.set_my_attendance_policy(smallint, smallint[], smallint[], public.month_end_rule, date, text) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.import_attendance_csv(jsonb, text, integer) from public, anon;
grant execute on function public.set_my_attendance_policy(smallint, smallint[], smallint[], public.month_end_rule, date, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.import_attendance_csv(jsonb, text, integer) to authenticated;
