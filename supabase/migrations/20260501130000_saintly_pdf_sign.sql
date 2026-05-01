-- Saintly PDF Sign: templates, packets, recipients, field values, audit events, I-9 cases, sensitive values.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.signature_templates (
  id uuid primary key default gen_random_uuid(),
  document_type text not null
    check (document_type in ('generic_contract', 'w9', 'i9')),
  name text not null,
  description text,
  storage_bucket text not null default 'signature-templates',
  storage_object_path text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_by_staff_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signature_templates_doc_type_idx
  on public.signature_templates (document_type, is_active);

create table if not exists public.signature_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.signature_templates (id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null
    check (field_type in ('text', 'textarea', 'date', 'checkbox', 'signature', 'tin', 'select')),
  pdf_acroform_field_name text,
  page_index integer not null default 0,
  x double precision,
  y double precision,
  width double precision,
  height double precision,
  font_size double precision not null default 10,
  required_order integer not null default 0,
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint signature_template_fields_template_id_field_key_key unique (template_id, field_key)
);

create index if not exists signature_template_fields_template_id_idx
  on public.signature_template_fields (template_id);

create table if not exists public.i9_cases (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  review_method text
    check (
      review_method is null
      or review_method in ('in_person_physical_review', 'remote_alternative_procedure_everify')
    ),
  workflow_phase text not null default 'section1'
    check (workflow_phase in ('section1', 'section2', 'completed')),
  section1_packet_id uuid unique,
  section2_completed_by_staff_user_id uuid references auth.users (id) on delete set null,
  section2_completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists i9_cases_applicant_id_idx on public.i9_cases (applicant_id);

create table if not exists public.signature_packets (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'sent',
        'viewed',
        'in_progress',
        'signed',
        'completed',
        'expired',
        'voided'
      )
    ),
  primary_document_type text not null
    check (primary_document_type in ('generic_contract', 'w9', 'i9')),
  crm_entity_type text not null
    check (crm_entity_type in ('applicant', 'lead', 'contact', 'vendor')),
  crm_entity_id uuid not null,
  i9_case_id uuid references public.i9_cases (id) on delete set null,
  i9_section text
    check (i9_section is null or i9_section in ('section1', 'section2')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_staff_user_id uuid references auth.users (id) on delete set null,
  expires_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signature_packets_crm_idx
  on public.signature_packets (crm_entity_type, crm_entity_id, created_at desc);
create index if not exists signature_packets_status_idx
  on public.signature_packets (status, created_at desc);

create table if not exists public.signature_packet_documents (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.signature_packets (id) on delete cascade,
  template_id uuid not null references public.signature_templates (id) on delete restrict,
  template_version_snapshot integer not null,
  completed_storage_bucket text,
  completed_storage_path text,
  completed_sha256 text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signature_packet_documents_packet_id_idx
  on public.signature_packet_documents (packet_id);

alter table public.i9_cases
  drop constraint if exists i9_cases_section1_packet_id_fkey;
alter table public.i9_cases
  add constraint i9_cases_section1_packet_id_fkey
    foreign key (section1_packet_id) references public.signature_packets (id) on delete set null;

create table if not exists public.signature_recipients (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.signature_packets (id) on delete cascade,
  email text not null,
  display_name text,
  token_hash text not null,
  token_expires_at timestamptz not null,
  recipient_kind text not null default 'signer'
    check (recipient_kind in ('signer', 'cc')),
  last_viewed_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint signature_recipients_token_hash_key unique (token_hash)
);

create index if not exists signature_recipients_packet_id_idx
  on public.signature_recipients (packet_id);

create table if not exists public.signature_field_values (
  id uuid primary key default gen_random_uuid(),
  packet_document_id uuid not null references public.signature_packet_documents (id) on delete cascade,
  template_field_id uuid not null references public.signature_template_fields (id) on delete cascade,
  recipient_id uuid references public.signature_recipients (id) on delete cascade,
  set_by_staff_user_id uuid references auth.users (id) on delete set null,
  text_value text,
  bool_value boolean,
  updated_at timestamptz not null default now(),
  constraint signature_field_values_one_actor check (
    (recipient_id is not null and set_by_staff_user_id is null)
    or (recipient_id is null and set_by_staff_user_id is not null)
    or (recipient_id is null and set_by_staff_user_id is null)
  ),
  constraint signature_field_values_doc_field_key unique (packet_document_id, template_field_id)
);

create table if not exists public.sensitive_document_values (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.signature_recipients (id) on delete cascade,
  packet_document_id uuid not null references public.signature_packet_documents (id) on delete cascade,
  field_key text not null,
  ciphertext text not null,
  last4 text not null,
  created_at timestamptz not null default now(),
  constraint sensitive_document_values_recipient_doc_field_key
    unique (recipient_id, packet_document_id, field_key)
);

create index if not exists sensitive_document_values_packet_document_id_idx
  on public.sensitive_document_values (packet_document_id);

create table if not exists public.signature_events (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.signature_packets (id) on delete cascade,
  recipient_id uuid references public.signature_recipients (id) on delete set null,
  actor text not null default 'system' check (actor in ('recipient', 'staff', 'system')),
  actor_staff_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  ip_address text,
  user_agent text,
  template_version integer,
  document_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists signature_events_packet_id_idx
  on public.signature_events (packet_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------

create or replace function public.touch_signature_packet_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists signature_templates_updated_at on public.signature_templates;
create trigger signature_templates_updated_at
  before update on public.signature_templates
  for each row execute function public.touch_signature_packet_updated_at();

drop trigger if exists signature_packets_updated_at on public.signature_packets;
create trigger signature_packets_updated_at
  before update on public.signature_packets
  for each row execute function public.touch_signature_packet_updated_at();

drop trigger if exists signature_packet_documents_updated_at on public.signature_packet_documents;
create trigger signature_packet_documents_updated_at
  before update on public.signature_packet_documents
  for each row execute function public.touch_signature_packet_updated_at();

drop trigger if exists i9_cases_updated_at on public.i9_cases;
create trigger i9_cases_updated_at
  before update on public.i9_cases
  for each row execute function public.touch_signature_packet_updated_at();

-- ---------------------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('signature-templates', 'signature-templates', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('signature-completed', 'signature-completed', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('i9-documents', 'i9-documents', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.signature_templates enable row level security;
alter table public.signature_template_fields enable row level security;
alter table public.signature_packets enable row level security;
alter table public.signature_packet_documents enable row level security;
alter table public.signature_recipients enable row level security;
alter table public.signature_field_values enable row level security;
alter table public.sensitive_document_values enable row level security;
alter table public.signature_events enable row level security;
alter table public.i9_cases enable row level security;

-- Managers/DON+ can manage most PDF sign data (I-9 cases restricted below).
drop policy if exists "signature_templates_select_staff" on public.signature_templates;
create policy "signature_templates_select_staff"
  on public.signature_templates for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_templates_write_staff" on public.signature_templates;
create policy "signature_templates_write_staff"
  on public.signature_templates for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "signature_template_fields_select_staff" on public.signature_template_fields;
create policy "signature_template_fields_select_staff"
  on public.signature_template_fields for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_template_fields_write_staff" on public.signature_template_fields;
create policy "signature_template_fields_write_staff"
  on public.signature_template_fields for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "signature_packets_select_staff" on public.signature_packets;
create policy "signature_packets_select_staff"
  on public.signature_packets for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_packets_write_staff" on public.signature_packets;
create policy "signature_packets_write_staff"
  on public.signature_packets for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "signature_packets_update_staff" on public.signature_packets;
create policy "signature_packets_update_staff"
  on public.signature_packets for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "signature_packet_documents_select_staff" on public.signature_packet_documents;
create policy "signature_packet_documents_select_staff"
  on public.signature_packet_documents for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_packet_documents_write_staff" on public.signature_packet_documents;
create policy "signature_packet_documents_write_staff"
  on public.signature_packet_documents for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "signature_recipients_select_staff" on public.signature_recipients;
create policy "signature_recipients_select_staff"
  on public.signature_recipients for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_recipients_write_staff" on public.signature_recipients;
create policy "signature_recipients_write_staff"
  on public.signature_recipients for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "signature_field_values_select_staff" on public.signature_field_values;
create policy "signature_field_values_select_staff"
  on public.signature_field_values for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_field_values_write_staff" on public.signature_field_values;
create policy "signature_field_values_write_staff"
  on public.signature_field_values for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

-- Only admin / owner may read sensitive values (last4 + ciphertext). Prefer API masking; service role bypasses RLS.
drop policy if exists "sensitive_document_values_admin_select" on public.sensitive_document_values;
create policy "sensitive_document_values_admin_select"
  on public.sensitive_document_values for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "signature_events_select_staff" on public.signature_events;
create policy "signature_events_select_staff"
  on public.signature_events for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_events_insert_staff" on public.signature_events;
create policy "signature_events_insert_staff"
  on public.signature_events for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

-- I-9: admin + super_admin only
drop policy if exists "i9_cases_select_admin" on public.i9_cases;
create policy "i9_cases_select_admin"
  on public.i9_cases for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "i9_cases_write_admin" on public.i9_cases;
create policy "i9_cases_write_admin"
  on public.i9_cases for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Storage policies: templates + completed — manager/DON+
-- ---------------------------------------------------------------------------

drop policy if exists "signature_templates_bucket_select" on storage.objects;
create policy "signature_templates_bucket_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signature-templates'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "signature_templates_bucket_write" on storage.objects;
create policy "signature_templates_bucket_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'signature-templates'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'signature-templates'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "signature_completed_bucket_select" on storage.objects;
create policy "signature_completed_bucket_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signature-completed'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_completed_bucket_write" on storage.objects;
create policy "signature_completed_bucket_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'signature-completed'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'signature-completed'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

-- I-9 documents bucket: admin + super_admin only
drop policy if exists "i9_documents_bucket_select" on storage.objects;
create policy "i9_documents_bucket_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'i9-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "i9_documents_bucket_write" on storage.objects;
create policy "i9_documents_bucket_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'i9-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'i9-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  );

comment on table public.signature_templates is 'Saintly PDF Sign: uploaded PDF templates (W-9, I-9, IC agreements).';
comment on table public.signature_packets is 'Signing packet tied to a CRM entity; status drives workflow.';
comment on table public.sensitive_document_values is 'Encrypted TIN/SSN values; only admin/super_admin may select via RLS; app should expose last4 only.';
comment on table public.i9_cases is 'I-9 workflow metadata; restricted to admin/super_admin.';
