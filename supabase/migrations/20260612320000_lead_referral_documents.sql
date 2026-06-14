-- Phase 25: Secure referral document upload + intake document review.

insert into storage.buckets (id, name, public)
values ('lead-referral-documents', 'lead-referral-documents', false)
on conflict (id) do nothing;

create table if not exists public.lead_referral_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  facility_id uuid references public.facilities (id) on delete set null,
  contact_id uuid references public.facility_contacts (id) on delete set null,
  source_link_id uuid references public.facility_referral_source_links (id) on delete set null,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  uploaded_by_public boolean not null default false,
  document_type text,
  original_file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint,
  status text not null default 'uploaded',
  review_status text not null default 'needs_review',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  extracted_summary text,
  extracted_json jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_referral_documents_status_check
    check (status in ('uploaded', 'processing', 'ready', 'failed', 'deleted')),
  constraint lead_referral_documents_review_status_check
    check (review_status in ('needs_review', 'reviewed', 'rejected')),
  constraint lead_referral_documents_document_type_check
    check (
      document_type is null
      or document_type in (
        'face_sheet',
        'physician_order',
        'demographics',
        'insurance_card',
        'medication_list',
        'wound_note',
        'clinical_note',
        'referral_packet',
        'other'
      )
    )
);

create index if not exists lead_referral_documents_lead_id_idx
  on public.lead_referral_documents (lead_id);

create index if not exists lead_referral_documents_facility_id_idx
  on public.lead_referral_documents (facility_id)
  where facility_id is not null;

create index if not exists lead_referral_documents_source_link_id_idx
  on public.lead_referral_documents (source_link_id)
  where source_link_id is not null;

create index if not exists lead_referral_documents_document_type_idx
  on public.lead_referral_documents (document_type)
  where document_type is not null;

create index if not exists lead_referral_documents_review_status_idx
  on public.lead_referral_documents (review_status);

create index if not exists lead_referral_documents_created_at_idx
  on public.lead_referral_documents (created_at desc);

comment on table public.lead_referral_documents is
  'Referral documents from public /refer form or staff upload; files in Storage bucket lead-referral-documents.';

alter table public.lead_referral_documents enable row level security;

drop policy if exists "lead_referral_documents_select_staff" on public.lead_referral_documents;
create policy "lead_referral_documents_select_staff"
  on public.lead_referral_documents for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "lead_referral_documents_insert_staff" on public.lead_referral_documents;
create policy "lead_referral_documents_insert_staff"
  on public.lead_referral_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "lead_referral_documents_update_staff" on public.lead_referral_documents;
create policy "lead_referral_documents_update_staff"
  on public.lead_referral_documents for update to authenticated
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

-- Public uploads use service role only; no public insert/select policies.

drop policy if exists "lead_referral_docs_storage_select_staff" on storage.objects;
drop policy if exists "lead_referral_docs_storage_insert_staff" on storage.objects;
drop policy if exists "lead_referral_docs_storage_update_staff" on storage.objects;
drop policy if exists "lead_referral_docs_storage_delete_staff" on storage.objects;

create policy "lead_referral_docs_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lead-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_referral_docs_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_referral_docs_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'lead-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'lead-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "lead_referral_docs_storage_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lead-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
