-- CRM tasks hardening: immutables, created_by enforced from session, optional delete revocation.

create or replace function public.crm_tasks_enforce_audit_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.source := old.source;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_tasks_enforce_audit_before_insert on public.crm_tasks;
create trigger crm_tasks_enforce_audit_before_insert
  before insert on public.crm_tasks
  for each row
  execute function public.crm_tasks_enforce_audit_columns();

drop trigger if exists crm_tasks_enforce_audit_before_update on public.crm_tasks;
create trigger crm_tasks_enforce_audit_before_update
  before update on public.crm_tasks
  for each row
  execute function public.crm_tasks_enforce_audit_columns();

-- Hard deletes are not supported from the app shell (cancel sets status canceled).
drop policy if exists "crm_tasks_delete_staff" on public.crm_tasks;

-- Align CRM task access with manager-tier CRM operators.
drop policy if exists "crm_tasks_select_staff" on public.crm_tasks;
create policy "crm_tasks_select_staff"
  on public.crm_tasks for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active is not false
        and sp.role in (
          'manager',
          'admin',
          'super_admin',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
  );

drop policy if exists "crm_tasks_insert_staff" on public.crm_tasks;
create policy "crm_tasks_insert_staff"
  on public.crm_tasks for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active is not false
        and sp.role in (
          'manager',
          'admin',
          'super_admin',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
  );

drop policy if exists "crm_tasks_update_staff" on public.crm_tasks;
create policy "crm_tasks_update_staff"
  on public.crm_tasks for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active is not false
        and sp.role in (
          'manager',
          'admin',
          'super_admin',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active is not false
        and sp.role in (
          'manager',
          'admin',
          'super_admin',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
  );
