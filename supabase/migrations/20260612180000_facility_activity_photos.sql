-- Facility outreach photos (private Storage + metadata).
-- Bucket: facility-photos — object path: {facility_id}/{photo_id}-{safe_filename}

insert into storage.buckets (id, name, public)
values ('facility-photos', 'facility-photos', false)
on conflict (id) do nothing;

create table if not exists public.facility_activity_photos (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  activity_id uuid null references public.facility_activities (id) on delete set null,
  contact_id uuid null references public.facility_contacts (id) on delete set null,
  storage_path text not null,
  original_filename text null,
  mime_type text null,
  file_size_bytes bigint null,
  photo_type text null,
  ai_summary text null,
  ai_extracted_json jsonb null,
  uploaded_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists facility_activity_photos_facility_id_idx
  on public.facility_activity_photos (facility_id);

create index if not exists facility_activity_photos_activity_id_idx
  on public.facility_activity_photos (activity_id);

create index if not exists facility_activity_photos_contact_id_idx
  on public.facility_activity_photos (contact_id);

create index if not exists facility_activity_photos_uploaded_by_idx
  on public.facility_activity_photos (uploaded_by);

create index if not exists facility_activity_photos_created_at_idx
  on public.facility_activity_photos (created_at desc);

comment on table public.facility_activity_photos is
  'Field outreach photos linked to facilities/activities; files in Storage bucket facility-photos.';

alter table public.facility_activity_photos enable row level security;

drop policy if exists "facility_activity_photos_select_staff" on public.facility_activity_photos;
create policy "facility_activity_photos_select_staff"
  on public.facility_activity_photos for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_activity_photos_insert_staff" on public.facility_activity_photos;
create policy "facility_activity_photos_insert_staff"
  on public.facility_activity_photos for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_activity_photos_update_staff" on public.facility_activity_photos;
create policy "facility_activity_photos_update_staff"
  on public.facility_activity_photos for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_activity_photos_delete_staff" on public.facility_activity_photos;
create policy "facility_activity_photos_delete_staff"
  on public.facility_activity_photos for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_photos_storage_select_staff" on storage.objects;
drop policy if exists "facility_photos_storage_insert_staff" on storage.objects;
drop policy if exists "facility_photos_storage_update_staff" on storage.objects;
drop policy if exists "facility_photos_storage_delete_staff" on storage.objects;

create policy "facility_photos_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'facility-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "facility_photos_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'facility-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "facility_photos_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'facility-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'facility-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "facility_photos_storage_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'facility-photos'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
