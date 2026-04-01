-- Widen phone_calls SELECT to all active staff roles; app enforces nurse/manager visibility.
-- (Keeps authenticated clients working for realtime + list queries.)

drop policy if exists "phone_calls_select_admin" on public.phone_calls;

create policy "phone_calls_select_staff"
  on public.phone_calls
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('super_admin', 'admin', 'manager', 'nurse')
    )
  );
