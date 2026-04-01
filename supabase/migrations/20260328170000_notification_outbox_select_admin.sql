-- Allow admin / super_admin to read notification_outbox (queue inspection in admin UI).

drop policy if exists "notification_outbox_select_admin" on public.notification_outbox;

create policy "notification_outbox_select_admin"
  on public.notification_outbox
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
