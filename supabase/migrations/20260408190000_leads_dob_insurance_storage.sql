-- CRM lead intake: date of birth + insurance card file paths (Supabase Storage bucket lead-insurance).

alter table public.leads
  add column if not exists dob date;

alter table public.leads
  add column if not exists primary_insurance_file_url text;

alter table public.leads
  add column if not exists secondary_insurance_file_url text;

comment on column public.leads.dob is 'Lead/patient date of birth for CRM intake.';
comment on column public.leads.primary_insurance_file_url is 'Object path in Storage bucket lead-insurance (primary card image/PDF).';
comment on column public.leads.secondary_insurance_file_url is 'Object path in Storage bucket lead-insurance (secondary card image/PDF).';

insert into storage.buckets (id, name, public)
values ('lead-insurance', 'lead-insurance', false)
on conflict (id) do nothing;

-- Paths: {lead_id}/primary-{timestamp}-{filename}, {lead_id}/secondary-{timestamp}-{filename}

drop policy if exists "lead_insurance_storage_select_staff" on storage.objects;
drop policy if exists "lead_insurance_storage_insert_staff" on storage.objects;
drop policy if exists "lead_insurance_storage_update_staff" on storage.objects;
drop policy if exists "lead_insurance_storage_delete_staff" on storage.objects;

create policy "lead_insurance_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lead-insurance'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_insurance_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-insurance'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_insurance_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'lead-insurance'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'lead-insurance'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_insurance_storage_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lead-insurance'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
