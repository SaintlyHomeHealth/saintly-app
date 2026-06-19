-- Patient CRM quick-drop referral intake (separate from recruiting and marketing leads).

alter table public.contacts
  add column if not exists date_of_birth date;

comment on column public.contacts.date_of_birth is 'Patient date of birth for CRM intake and duplicate checks.';

create table if not exists public.patient_referrals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete set null,
  referral_source_type text not null,
  referral_source_name text,
  referral_facility text,
  source_contact_name text,
  source_phone text,
  source_fax text,
  source_email text,
  sales_agent_name text,
  received_date date,
  requested_soc_date date,
  best_available_soc_date date,
  discharge_date date,
  diagnosis_code text,
  diagnosis_text text,
  chief_complaint text,
  notes text,
  insurance_name text,
  member_id text,
  medicaid_id text,
  mbi text,
  authorization_number text,
  authorization_type text,
  authorization_bill_type text,
  authorization_effective_start date,
  authorization_effective_end date,
  sn_visits int,
  pt_visits int,
  ot_visits int,
  st_visits int,
  msw_visits int,
  hha_visits int,
  intake_status text not null default 'New Referral',
  parse_status text,
  parsed_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_referrals_referral_source_type_check check (
    referral_source_type in (
      'tango_dina',
      'doctor_provider',
      'hospital_facility',
      'sales_agent',
      'call_in',
      'website_lead',
      'fax',
      'email',
      'existing_patient_family',
      'insurance_payer',
      'other'
    )
  ),
  constraint patient_referrals_parse_status_check check (
    parse_status is null
    or parse_status in (
      'uploading',
      'reading',
      'extracting',
      'needs_review',
      'ready',
      'duplicate',
      'failed',
      'manual'
    )
  )
);

create index if not exists patient_referrals_patient_id_idx
  on public.patient_referrals (patient_id)
  where patient_id is not null;

create index if not exists patient_referrals_authorization_number_idx
  on public.patient_referrals (authorization_number)
  where authorization_number is not null and trim(authorization_number) <> '';

create index if not exists patient_referrals_mbi_idx
  on public.patient_referrals (mbi)
  where mbi is not null and trim(mbi) <> '';

create index if not exists patient_referrals_member_id_idx
  on public.patient_referrals (member_id)
  where member_id is not null and trim(member_id) <> '';

create index if not exists patient_referrals_created_at_idx
  on public.patient_referrals (created_at desc);

comment on table public.patient_referrals is
  'Patient intake referral records from quick-drop OCR workflow; linked to patients after review.';

create table if not exists public.patient_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete set null,
  referral_id uuid references public.patient_referrals (id) on delete set null,
  uploaded_by uuid references auth.users (id) on delete set null,
  file_name text not null,
  file_path text not null,
  file_type text,
  document_type text,
  referral_source_type text,
  parsed_json jsonb,
  parse_status text,
  created_at timestamptz not null default now(),
  constraint patient_files_document_type_check check (
    document_type is null
    or document_type in (
      'referral',
      'doctor_order',
      'tango_authorization',
      'hospital_discharge',
      'insurance_authorization',
      'face_sheet',
      'other'
    )
  ),
  constraint patient_files_parse_status_check check (
    parse_status is null
    or parse_status in (
      'uploading',
      'reading',
      'extracting',
      'needs_review',
      'ready',
      'duplicate',
      'failed',
      'manual'
    )
  )
);

create index if not exists patient_files_patient_id_idx
  on public.patient_files (patient_id)
  where patient_id is not null;

create index if not exists patient_files_referral_id_idx
  on public.patient_files (referral_id)
  where referral_id is not null;

create index if not exists patient_files_created_at_idx
  on public.patient_files (created_at desc);

comment on table public.patient_files is
  'Uploaded patient referral/intake documents; files in Storage bucket patient-referral-documents.';

insert into storage.buckets (id, name, public)
values ('patient-referral-documents', 'patient-referral-documents', false)
on conflict (id) do nothing;

alter table public.patient_referrals enable row level security;
alter table public.patient_files enable row level security;

drop policy if exists "patient_referrals_select_staff" on public.patient_referrals;
create policy "patient_referrals_select_staff"
  on public.patient_referrals for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_referrals_insert_staff" on public.patient_referrals;
create policy "patient_referrals_insert_staff"
  on public.patient_referrals for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_referrals_update_staff" on public.patient_referrals;
create policy "patient_referrals_update_staff"
  on public.patient_referrals for update to authenticated
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

drop policy if exists "patient_files_select_staff" on public.patient_files;
create policy "patient_files_select_staff"
  on public.patient_files for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_files_insert_staff" on public.patient_files;
create policy "patient_files_insert_staff"
  on public.patient_files for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_files_update_staff" on public.patient_files;
create policy "patient_files_update_staff"
  on public.patient_files for update to authenticated
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

drop policy if exists "patient_referral_docs_storage_select_staff" on storage.objects;
drop policy if exists "patient_referral_docs_storage_insert_staff" on storage.objects;
drop policy if exists "patient_referral_docs_storage_update_staff" on storage.objects;
drop policy if exists "patient_referral_docs_storage_delete_staff" on storage.objects;

create policy "patient_referral_docs_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'patient-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "patient_referral_docs_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "patient_referral_docs_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'patient-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'patient-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "patient_referral_docs_storage_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'patient-referral-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create or replace function public.touch_patient_referrals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists patient_referrals_updated_at on public.patient_referrals;
create trigger patient_referrals_updated_at
  before update on public.patient_referrals
  for each row
  execute function public.touch_patient_referrals_updated_at();
