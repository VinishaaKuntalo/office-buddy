create extension if not exists pgcrypto with schema extensions;

create type public.attendance_status as enum (
  'in_office',
  'approved_absence',
  'holiday',
  'remote',
  'not_in_office'
);

create type public.attendance_source as enum (
  'manual',
  'csv_import',
  'badge',
  'hr_feed',
  'outlook',
  'holiday_feed',
  'admin_correction',
  'system'
);

create type public.month_end_rule as enum (
  'calendar_month',
  'month_end_monday_to_previous_month'
);

create type public.organization_role as enum ('member', 'admin', 'owner');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  timezone text not null default 'America/Toronto',
  locale text not null default 'en-CA',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 120),
  constraint profiles_timezone_nonempty check (char_length(timezone) > 0)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_nonempty check (char_length(trim(name)) > 0)
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_org_idx
  on public.organization_members (user_id, organization_id);
create index organization_members_org_idx
  on public.organization_members (organization_id);

create table public.office_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Toronto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_locations_one_owner check (
    (user_id is not null and organization_id is null)
    or (user_id is null and organization_id is not null)
  ),
  constraint office_locations_name_nonempty check (char_length(trim(name)) > 0)
);

create index office_locations_user_idx on public.office_locations (user_id);
create index office_locations_org_idx on public.office_locations (organization_id);
create unique index office_locations_single_user_uidx
  on public.office_locations (user_id)
  where user_id is not null;

create table public.attendance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  name text not null default 'Default policy',
  required_days_per_week smallint not null default 3,
  preferred_weekdays smallint[] not null default array[2, 3, 4]::smallint[],
  eligible_weekdays smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  reduce_for_approved_absences boolean not null default true,
  reduce_for_holidays boolean not null default true,
  month_end_rule public.month_end_rule not null default 'month_end_monday_to_previous_month',
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_policies_one_owner check (
    (user_id is not null and organization_id is null)
    or (user_id is null and organization_id is not null)
  ),
  constraint attendance_policies_required_days check (required_days_per_week between 0 and 7),
  constraint attendance_policies_weekdays check (
    cardinality(preferred_weekdays) <= 7
    and cardinality(eligible_weekdays) between 1 and 7
    and preferred_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and eligible_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and preferred_weekdays <@ eligible_weekdays
  ),
  constraint attendance_policies_effective_range check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint attendance_policies_name_nonempty check (char_length(trim(name)) > 0)
);

comment on column public.attendance_policies.preferred_weekdays is
  'JavaScript weekday values from 0=Sunday through 6=Saturday; preferences do not restrict eligibility.';
comment on column public.attendance_policies.eligible_weekdays is
  'Weekdays on which attendance may count toward the requirement; uses 0=Sunday through 6=Saturday.';

create index attendance_policies_user_effective_idx
  on public.attendance_policies (user_id, effective_from, effective_to);
create index attendance_policies_org_effective_idx
  on public.attendance_policies (organization_id, effective_from, effective_to);

create table public.user_policy_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  policy_id uuid not null references public.attendance_policies (id) on delete cascade,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_policy_assignments_effective_range check (
    effective_to is null or effective_to >= effective_from
  )
);

create index user_policy_assignments_user_effective_idx
  on public.user_policy_assignments (user_id, effective_from, effective_to);
create index user_policy_assignments_policy_idx on public.user_policy_assignments (policy_id);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_date date not null,
  status public.attendance_status not null,
  source public.attendance_source not null default 'manual',
  external_event_id text,
  source_metadata jsonb,
  corrects_event_id uuid references public.attendance_events (id) on delete cascade,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_events_notes_length check (char_length(notes) <= 2000),
  constraint attendance_events_external_id_length check (
    external_event_id is null or char_length(external_event_id) <= 2048
  ),
  constraint attendance_events_source_metadata_object check (
    source_metadata is null or jsonb_typeof(source_metadata) = 'object'
  ),
  constraint attendance_events_correction_link check (
    (source = 'admin_correction' and corrects_event_id is not null)
    or (source <> 'admin_correction' and corrects_event_id is null)
  )
);

create index attendance_events_user_date_idx
  on public.attendance_events (user_id, event_date desc);
create unique index attendance_events_external_source_uidx
  on public.attendance_events (user_id, source, external_event_id);

comment on column public.attendance_events.source_metadata is
  'Optional, non-authoritative metadata from the source; never place secrets or unnecessary personal data here.';
comment on column public.attendance_events.corrects_event_id is
  'Optional link from an administrative correction to the original immutable source event.';

create table public.approved_absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  source public.attendance_source not null default 'manual',
  external_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_absences_date_range check (end_date >= start_date),
  constraint approved_absences_reason_length check (char_length(reason) <= 500),
  constraint approved_absences_external_id_length check (
    external_event_id is null or char_length(external_event_id) <= 2048
  )
);

create index approved_absences_user_dates_idx
  on public.approved_absences (user_id, start_date, end_date);
create unique index approved_absences_external_source_uidx
  on public.approved_absences (user_id, source, external_event_id);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  holiday_date date not null,
  name text not null,
  source public.attendance_source not null default 'manual',
  external_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holidays_one_owner check (
    (user_id is not null and organization_id is null)
    or (user_id is null and organization_id is not null)
  ),
  constraint holidays_name_nonempty check (char_length(trim(name)) > 0),
  constraint holidays_external_id_length check (
    external_event_id is null or char_length(external_event_id) <= 2048
  )
);

create index holidays_user_date_idx on public.holidays (user_id, holiday_date);
create index holidays_org_date_idx on public.holidays (organization_id, holiday_date);
create unique index holidays_external_source_user_uidx
  on public.holidays (user_id, source, external_event_id);
create unique index holidays_external_source_org_uidx
  on public.holidays (organization_id, source, external_event_id);

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  in_app_enabled boolean not null default true,
  office_reminder_enabled boolean not null default false,
  reminder_time time not null default '17:00',
  reminder_timezone text not null default 'America/Toronto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_timezone_nonempty check (
    char_length(reminder_timezone) > 0
  )
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null check (notification_type in (
    'office_reminder',
    'one_more_day_needed',
    'at_risk',
    'weekly_target_complete',
    'monthly_target_complete',
    'approved_absence_adjustment',
    'data_issue'
  )),
  deduplication_key text not null,
  title text not null,
  message text not null,
  due_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, deduplication_key)
);

create index notification_log_user_due_idx
  on public.notification_log (user_id, due_at, read_at);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_file_name_length check (char_length(file_name) between 1 and 255)
);

create index import_batches_user_created_idx on public.import_batches (user_id, created_at desc);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_user_entity_idx
  on public.audit_log (user_id, entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  row_user_id uuid;
  row_id uuid;
  event_details jsonb := '{}'::jsonb;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_user_id := (row_data ->> 'user_id')::uuid;
  if row_user_id is null then
    row_user_id := (row_data ->> 'owner_user_id')::uuid;
  end if;
  row_id := (row_data ->> 'id')::uuid;

  if tg_table_name = 'attendance_events' then
    event_details := jsonb_build_object(
      'old_event_date', case when tg_op = 'INSERT' then null else old.event_date end,
      'new_event_date', case when tg_op = 'DELETE' then null else new.event_date end,
      'old_status', case when tg_op = 'INSERT' then null else old.status end,
      'new_status', case when tg_op = 'DELETE' then null else new.status end,
      'source', row_data ->> 'source'
    );
  end if;

  if row_user_id is not null then
    insert into public.audit_log (user_id, entity_type, entity_id, action, details)
    values (row_user_id, tg_table_name, row_id, lower(tg_op), event_details);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_imported_record_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source <> 'manual' and pg_trigger_depth() = 1 then
    raise exception 'Imported records cannot be changed directly; create an administrative correction instead.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.validate_attendance_correction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.corrects_event_id is not null and not exists (
    select 1
    from public.attendance_events original
    where original.id = new.corrects_event_id
      and original.user_id = new.user_id
  ) then
    raise exception 'A correction must refer to an event belonging to the same user.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function public.bootstrap_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_policy_id uuid;
begin
  insert into public.profiles (id, display_name, timezone, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    'America/Toronto',
    'en-CA'
  );

  insert into public.attendance_policies (user_id, name)
  values (new.id, 'Default policy')
  returning id into default_policy_id;

  insert into public.user_policy_assignments (user_id, policy_id)
  values (new.id, default_policy_id);

  insert into public.notification_preferences (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger auth_user_bootstrap
  after insert on auth.users
  for each row execute function public.bootstrap_new_user();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'organizations',
    'organization_members',
    'office_locations',
    'attendance_policies',
    'user_policy_assignments',
    'attendance_events',
    'approved_absences',
    'holidays',
    'notification_preferences',
    'notification_log',
    'import_batches'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

create trigger attendance_events_prevent_import_mutation
  before update or delete on public.attendance_events
  for each row execute function public.prevent_imported_record_mutation();
create trigger attendance_events_validate_correction
  before insert or update on public.attendance_events
  for each row execute function public.validate_attendance_correction();
create trigger approved_absences_prevent_import_mutation
  before update or delete on public.approved_absences
  for each row execute function public.prevent_imported_record_mutation();
create trigger holidays_prevent_import_mutation
  before update or delete on public.holidays
  for each row execute function public.prevent_imported_record_mutation();
create trigger attendance_events_audit
  after insert or update or delete on public.attendance_events
  for each row execute function public.write_audit_log();
create trigger approved_absences_audit
  after insert or update or delete on public.approved_absences
  for each row execute function public.write_audit_log();
create trigger holidays_audit
  after insert or update or delete on public.holidays
  for each row execute function public.write_audit_log();
create trigger attendance_policies_audit
  after insert or update or delete on public.attendance_policies
  for each row execute function public.write_audit_log();
create trigger user_policy_assignments_audit
  after insert or update or delete on public.user_policy_assignments
  for each row execute function public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.office_locations enable row level security;
alter table public.attendance_policies enable row level security;
alter table public.user_policy_assignments enable row level security;
alter table public.attendance_events enable row level security;
alter table public.approved_absences enable row level security;
alter table public.holidays enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_log enable row level security;
alter table public.import_batches enable row level security;
alter table public.audit_log enable row level security;

create policy "Profiles are private to their owner"
  on public.profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Organizations are visible to their members"
  on public.organizations for select to authenticated
  using (exists (
    select 1 from public.organization_members member
    where member.organization_id = id and member.user_id = (select auth.uid())
  ));

create policy "Members can view their organization membership"
  on public.organization_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.organization_members own_membership
      where own_membership.organization_id = organization_id
        and own_membership.user_id = (select auth.uid())
    )
  );

create policy "Users manage their own office locations"
  on public.office_locations for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and organization_id is null);
create policy "Organization members view office locations"
  on public.office_locations for select to authenticated
  using (organization_id is not null and exists (
    select 1 from public.organization_members member
    where member.organization_id = office_locations.organization_id
      and member.user_id = (select auth.uid())
  ));

create policy "Users manage their own attendance policies"
  on public.attendance_policies for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and organization_id is null);
create policy "Organization members view organization policies"
  on public.attendance_policies for select to authenticated
  using (organization_id is not null and exists (
    select 1 from public.organization_members member
    where member.organization_id = attendance_policies.organization_id
      and member.user_id = (select auth.uid())
  ));

create policy "Users manage their own policy assignments"
  on public.user_policy_assignments for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.attendance_policies policy
      where policy.id = policy_id
        and (
          policy.user_id = (select auth.uid())
          or exists (
            select 1 from public.organization_members member
            where member.organization_id = policy.organization_id
              and member.user_id = (select auth.uid())
          )
        )
    )
  );

create policy "Users manage their own attendance events"
  on public.attendance_events for all to authenticated
  using (user_id = (select auth.uid()) and source = 'manual')
  with check (user_id = (select auth.uid()));
create policy "Users can view their imported attendance"
  on public.attendance_events for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users manage their own approved absences"
  on public.approved_absences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage personal holidays"
  on public.holidays for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and organization_id is null);
create policy "Organization members view organization holidays"
  on public.holidays for select to authenticated
  using (organization_id is not null and exists (
    select 1 from public.organization_members member
    where member.organization_id = holidays.organization_id
      and member.user_id = (select auth.uid())
  ));

create policy "Users manage their notification preferences"
  on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users manage their notifications"
  on public.notification_log for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users manage their import batches"
  on public.import_batches for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can read their audit history"
  on public.audit_log for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on function public.write_audit_log() from public, anon, authenticated;
revoke all on function public.bootstrap_new_user() from public, anon, authenticated;
revoke all on function public.prevent_imported_record_mutation() from public, anon, authenticated;
revoke all on function public.validate_attendance_correction() from public, anon, authenticated;
