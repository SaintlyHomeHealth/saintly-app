-- Append-only audit trail for sensitive admin actions (app + trigger inserts).

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_actor_idx on public.audit_log (actor_user_id);

alter table public.audit_log enable row level security;

-- Staff may insert only their own actor row (app + future clients)
drop policy if exists "audit_log_insert_self" on public.audit_log;
create policy "audit_log_insert_self"
  on public.audit_log
  for insert
  to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

-- No SELECT policy for authenticated: reads reserved for service role / SQL (future admin UI)

-- Trigger: credential mutations via PostgREST (JWT present) — logs create/update/delete
create or replace function public.audit_employee_credentials_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_action text;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select sp.email into v_email
  from public.staff_profiles sp
  where sp.user_id = v_uid
  limit 1;

  if tg_op = 'INSERT' then
    v_action := 'credential_create';
    insert into public.audit_log (actor_user_id, actor_email, action, entity_type, entity_id, metadata)
    values (
      v_uid,
      v_email,
      v_action,
      'employee_credentials',
      new.id,
      jsonb_build_object(
        'employee_id', new.employee_id,
        'credential_type', new.credential_type
      )
    );
    return new;
  elsif tg_op = 'UPDATE' then
    v_action := 'credential_update';
    insert into public.audit_log (actor_user_id, actor_email, action, entity_type, entity_id, metadata)
    values (
      v_uid,
      v_email,
      v_action,
      'employee_credentials',
      new.id,
      jsonb_build_object(
        'employee_id', new.employee_id,
        'credential_type', new.credential_type
      )
    );
    return new;
  elsif tg_op = 'DELETE' then
    v_action := 'credential_delete';
    insert into public.audit_log (actor_user_id, actor_email, action, entity_type, entity_id, metadata)
    values (
      v_uid,
      v_email,
      v_action,
      'employee_credentials',
      old.id,
      jsonb_build_object(
        'employee_id', old.employee_id,
        'credential_type', old.credential_type
      )
    );
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists audit_employee_credentials_changes on public.employee_credentials;
create trigger audit_employee_credentials_changes
  after insert or update or delete on public.employee_credentials
  for each row
  execute function public.audit_employee_credentials_changes();
