-- Row-level security for employee credential records and files in storage.
-- Prereqs: public.staff_profiles exists; Storage bucket `employee-credentials` exists.
--
-- Before running: in Supabase Dashboard → Storage → Policies, remove any broad policies on
-- bucket `employee-credentials` that allow all authenticated users to upload/delete, or those
-- rules will combine with OR and defeat manager read-only intent.

alter table public.employee_credentials enable row level security;

drop policy if exists "employee_credentials_select_staff" on public.employee_credentials;
drop policy if exists "employee_credentials_insert_admin" on public.employee_credentials;
drop policy if exists "employee_credentials_update_admin" on public.employee_credentials;
drop policy if exists "employee_credentials_delete_admin" on public.employee_credentials;

-- manager, admin, super_admin: read all rows (admin app staff)
create policy "employee_credentials_select_staff"
  on public.employee_credentials
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

-- admin, super_admin only: writes
create policy "employee_credentials_insert_admin"
  on public.employee_credentials
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

create policy "employee_credentials_update_admin"
  on public.employee_credentials
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

create policy "employee_credentials_delete_admin"
  on public.employee_credentials
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

-- Storage: bucket id must match CredentialManager uploads (employee-credentials)
drop policy if exists "employee_credentials_storage_select_staff" on storage.objects;
drop policy if exists "employee_credentials_storage_insert_admin" on storage.objects;
drop policy if exists "employee_credentials_storage_update_admin" on storage.objects;
drop policy if exists "employee_credentials_storage_delete_admin" on storage.objects;

create policy "employee_credentials_storage_select_staff"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'employee-credentials'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "employee_credentials_storage_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'employee-credentials'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

create policy "employee_credentials_storage_update_admin"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'employee-credentials'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'employee-credentials'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

create policy "employee_credentials_storage_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'employee-credentials'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );
