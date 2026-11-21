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

  -- Cascaded deletes must not recreate audit rows for a deleted account.
  if tg_op = 'DELETE' and row_user_id is not null
    and not exists (select 1 from auth.users where id = row_user_id) then
    return old;
  end if;

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

revoke all on function public.write_audit_log() from public, anon, authenticated;
