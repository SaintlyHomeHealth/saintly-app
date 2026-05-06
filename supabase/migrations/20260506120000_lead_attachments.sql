-- CRM lead file attachments (private Storage + metadata).
-- Bucket: lead-attachments — object path: {lead_id}/{attachment_id}-{safe_filename}
--
-- RLS roles match public.leads (manager, admin, super_admin): same staff who can SELECT leads
-- as authenticated can manage attachments. Other app roles (recruiter, dispatch, DON, billing,
-- credentialing) must not get attachment access unless `leads` policies are expanded for them too.

insert into storage.buckets (id, name, public)
values ('lead-attachments', 'lead-attachments', false)
on conflict (id) do nothing;

create table if not exists public.lead_attachments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  uploaded_by uuid null references auth.users (id) on delete set null,
  file_name text not null,
  file_path text not null,
  content_type text null,
  size_bytes bigint null,
  category text not null default 'Other',
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists lead_attachments_lead_id_idx
  on public.lead_attachments(lead_id);

create index if not exists lead_attachments_created_at_idx
  on public.lead_attachments(created_at desc);

comment on table public.lead_attachments is
  'CRM lead uploads (doctor orders, referrals, etc.); files in Storage bucket lead-attachments.';

alter table public.lead_attachments enable row level security;

drop policy if exists "lead_attachments_select_staff" on public.lead_attachments;
create policy "lead_attachments_select_staff"
  on public.lead_attachments for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "lead_attachments_insert_staff" on public.lead_attachments;
create policy "lead_attachments_insert_staff"
  on public.lead_attachments for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "lead_attachments_update_staff" on public.lead_attachments;
create policy "lead_attachments_update_staff"
  on public.lead_attachments for update to authenticated
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

drop policy if exists "lead_attachments_delete_staff" on public.lead_attachments;
create policy "lead_attachments_delete_staff"
  on public.lead_attachments for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

-- Storage: same staff roles as leads
drop policy if exists "lead_attach_storage_select_staff" on storage.objects;
drop policy if exists "lead_attach_storage_insert_staff" on storage.objects;
drop policy if exists "lead_attach_storage_update_staff" on storage.objects;
drop policy if exists "lead_attach_storage_delete_staff" on storage.objects;

create policy "lead_attach_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_attach_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_attach_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_attach_storage_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lead-attachments'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
