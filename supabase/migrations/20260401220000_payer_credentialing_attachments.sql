-- General-purpose file attachments for payer credentialing (Storage + metadata table).
-- Bucket: payer-credentialing — paths: {credentialing_record_id}/{attachment_id}/{filename}

insert into storage.buckets (id, name, public)
values ('payer-credentialing', 'payer-credentialing', false)
on conflict (id) do nothing;

create table if not exists public.payer_credentialing_attachments (
  id uuid primary key default gen_random_uuid(),
  credentialing_record_id uuid not null references public.payer_credentialing_records (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  category text,
  description text,
  uploaded_at timestamptz not null default now(),
  uploaded_by_user_id uuid references auth.users (id) on delete set null
);

create index if not exists payer_cred_attachments_record_idx
  on public.payer_credentialing_attachments (credentialing_record_id, uploaded_at desc);

comment on table public.payer_credentialing_attachments is
  'Ad-hoc files for a payer credentialing record (contracts, letters, screenshots); files live in Storage bucket payer-credentialing.';

alter table public.payer_credentialing_attachments enable row level security;

drop policy if exists "payer_cred_attachments_select_staff" on public.payer_credentialing_attachments;
create policy "payer_cred_attachments_select_staff"
  on public.payer_credentialing_attachments for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_attachments_insert_staff" on public.payer_credentialing_attachments;
create policy "payer_cred_attachments_insert_staff"
  on public.payer_credentialing_attachments for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_attachments_update_staff" on public.payer_credentialing_attachments;
create policy "payer_cred_attachments_update_staff"
  on public.payer_credentialing_attachments for update to authenticated
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

drop policy if exists "payer_cred_attachments_delete_staff" on public.payer_credentialing_attachments;
create policy "payer_cred_attachments_delete_staff"
  on public.payer_credentialing_attachments for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

-- Storage (same staff roles as payer_credentialing_records)
drop policy if exists "payer_cred_storage_select_staff" on storage.objects;
drop policy if exists "payer_cred_storage_insert_staff" on storage.objects;
drop policy if exists "payer_cred_storage_update_staff" on storage.objects;
drop policy if exists "payer_cred_storage_delete_staff" on storage.objects;

create policy "payer_cred_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payer-credentialing'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "payer_cred_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payer-credentialing'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "payer_cred_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payer-credentialing'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'payer-credentialing'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "payer_cred_storage_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payer-credentialing'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
