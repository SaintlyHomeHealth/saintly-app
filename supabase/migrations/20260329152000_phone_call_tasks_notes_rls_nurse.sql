-- Allow nurses to read phone_call_tasks / phone_call_notes (writes stay server-side).

drop policy if exists "phone_call_tasks_select_staff" on public.phone_call_tasks;

create policy "phone_call_tasks_select_staff"
  on public.phone_call_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('admin', 'super_admin', 'manager', 'nurse')
    )
  );

drop policy if exists "phone_call_notes_select_staff" on public.phone_call_notes;

create policy "phone_call_notes_select_staff"
  on public.phone_call_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('admin', 'super_admin', 'manager', 'nurse')
    )
  );
