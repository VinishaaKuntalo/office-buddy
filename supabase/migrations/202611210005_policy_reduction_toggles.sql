-- Let users choose whether approved absences and holidays count toward their
-- weekly target (the existing reduce_for_* policy flags, default on).

drop function if exists public.set_my_attendance_policy(smallint, smallint[], smallint[], public.month_end_rule, date, text);

create or replace function public.set_my_attendance_policy(
  p_required_days smallint,
  p_preferred_weekdays smallint[],
  p_eligible_weekdays smallint[],
  p_month_end_rule public.month_end_rule,
  p_effective_from date,
  p_name text default 'Personal policy',
  -- null keeps the current policy's value
  p_reduce_for_approved_absences boolean default null,
  p_reduce_for_holidays boolean default null
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
        reduce_for_approved_absences = coalesce(p_reduce_for_approved_absences, current_policy.reduce_for_approved_absences),
        reduce_for_holidays = coalesce(p_reduce_for_holidays, current_policy.reduce_for_holidays),
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
    coalesce(p_reduce_for_approved_absences, current_policy.reduce_for_approved_absences),
    coalesce(p_reduce_for_holidays, current_policy.reduce_for_holidays),
    p_month_end_rule, p_effective_from
  )
  returning id into new_policy_id;

  insert into public.user_policy_assignments (user_id, policy_id, effective_from)
  values (auth.uid(), new_policy_id, p_effective_from);

  return new_policy_id;
end;
$$;

revoke all on function public.set_my_attendance_policy(smallint, smallint[], smallint[], public.month_end_rule, date, text, boolean, boolean) from public, anon;
grant execute on function public.set_my_attendance_policy(smallint, smallint[], smallint[], public.month_end_rule, date, text, boolean, boolean) to authenticated;
