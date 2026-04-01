-- Allow admin / super_admin to read audit_log (managers: insert-only via existing policy).

drop policy if exists "audit_log_select_admin" on public.audit_log;

create policy "audit_log_select_admin"
  on public.audit_log
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );
