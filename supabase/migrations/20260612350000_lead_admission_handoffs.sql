-- Phase 28: Accepted referral to SOC / admission handoff.

create table if not exists public.lead_admission_handoffs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  referring_facility_id uuid references public.facilities (id) on delete set null,
  referring_facility_contact_id uuid references public.facility_contacts (id) on delete set null,
  source_link_id uuid references public.facility_referral_source_links (id) on delete set null,
  intake_readiness_review_id uuid references public.lead_intake_readiness_reviews (id) on delete set null,
  status text not null default 'draft',
  admission_priority text not null default 'Normal',
  primary_discipline text,
  requested_services text[],
  payer_name text,
  payer_status text,
  auth_required boolean,
  auth_status text,
  benefits_verified boolean not null default false,
  benefits_verified_at timestamptz,
  benefits_verified_by uuid references auth.users (id) on delete set null,
  target_soc_date date,
  scheduled_soc_at timestamptz,
  soc_status text,
  assigned_intake_owner uuid references auth.users (id) on delete set null,
  assigned_clinician_id uuid references auth.users (id) on delete set null,
  assigned_clinician_name text,
  alora_status text,
  alora_patient_id text,
  alora_entered_at timestamptz,
  alora_entered_by uuid references auth.users (id) on delete set null,
  physician_order_status text,
  f2f_status text,
  documents_status text,
  missing_items jsonb,
  blockers jsonb,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_admission_handoffs_status_check
    check (status in ('draft', 'intake_review', 'ready_for_soc', 'scheduled', 'admitted', 'on_hold', 'canceled')),
  constraint lead_admission_handoffs_admission_priority_check
    check (admission_priority in ('Low', 'Normal', 'High', 'Urgent')),
  constraint lead_admission_handoffs_payer_status_check
    check (
      payer_status is null
      or payer_status in (
        'unknown', 'needs_verification', 'verified', 'not_accepted',
        'auth_required', 'auth_pending', 'auth_approved', 'auth_denied'
      )
    ),
  constraint lead_admission_handoffs_auth_status_check
    check (
      auth_status is null
      or auth_status in ('not_required', 'unknown', 'required', 'pending', 'approved', 'denied')
    ),
  constraint lead_admission_handoffs_soc_status_check
    check (
      soc_status is null
      or soc_status in ('not_scheduled', 'target_set', 'scheduled', 'completed', 'delayed', 'canceled')
    ),
  constraint lead_admission_handoffs_alora_status_check
    check (
      alora_status is null
      or alora_status in ('not_started', 'entered', 'pending_info', 'completed', 'not_applicable')
    ),
  constraint lead_admission_handoffs_physician_order_status_check
    check (
      physician_order_status is null
      or physician_order_status in ('missing', 'requested', 'received', 'reviewed', 'not_required', 'unknown')
    ),
  constraint lead_admission_handoffs_f2f_status_check
    check (
      f2f_status is null
      or f2f_status in ('missing', 'requested', 'received', 'reviewed', 'not_required', 'unknown')
    ),
  constraint lead_admission_handoffs_documents_status_check
    check (
      documents_status is null
      or documents_status in ('missing', 'partial', 'complete', 'needs_review')
    )
);

create index if not exists lead_admission_handoffs_lead_id_idx on public.lead_admission_handoffs (lead_id);
create index if not exists lead_admission_handoffs_patient_id_idx
  on public.lead_admission_handoffs (patient_id) where patient_id is not null;
create index if not exists lead_admission_handoffs_status_idx on public.lead_admission_handoffs (status);
create index if not exists lead_admission_handoffs_target_soc_date_idx
  on public.lead_admission_handoffs (target_soc_date) where target_soc_date is not null;
create index if not exists lead_admission_handoffs_scheduled_soc_at_idx
  on public.lead_admission_handoffs (scheduled_soc_at desc) where scheduled_soc_at is not null;
create index if not exists lead_admission_handoffs_assigned_intake_owner_idx
  on public.lead_admission_handoffs (assigned_intake_owner) where assigned_intake_owner is not null;
create index if not exists lead_admission_handoffs_assigned_clinician_id_idx
  on public.lead_admission_handoffs (assigned_clinician_id) where assigned_clinician_id is not null;
create index if not exists lead_admission_handoffs_referring_facility_id_idx
  on public.lead_admission_handoffs (referring_facility_id) where referring_facility_id is not null;
create index if not exists lead_admission_handoffs_created_at_idx
  on public.lead_admission_handoffs (created_at desc);

comment on table public.lead_admission_handoffs is
  'SOC/admission handoff tracking from accepted referral through Alora entry and scheduling.';

create table if not exists public.lead_admission_handoff_checklist_items (
  id uuid primary key default gen_random_uuid(),
  admission_handoff_id uuid not null references public.lead_admission_handoffs (id) on delete cascade,
  key text not null,
  label text not null,
  category text,
  status text not null default 'pending',
  required boolean not null default true,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  notes text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_admission_handoff_checklist_items_status_check
    check (status in ('pending', 'complete', 'not_required', 'blocked')),
  constraint lead_admission_handoff_checklist_items_handoff_key_uidx
    unique (admission_handoff_id, key)
);

create index if not exists lead_admission_handoff_checklist_items_handoff_id_idx
  on public.lead_admission_handoff_checklist_items (admission_handoff_id);

alter table public.lead_admission_handoffs enable row level security;
alter table public.lead_admission_handoff_checklist_items enable row level security;

drop policy if exists "lead_admission_handoffs_select_staff" on public.lead_admission_handoffs;
create policy "lead_admission_handoffs_select_staff"
  on public.lead_admission_handoffs for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent', 'recruiter', 'dispatch', 'billing', 'credentialing', 'don')
    )
  );

drop policy if exists "lead_admission_handoffs_write_staff" on public.lead_admission_handoffs;
create policy "lead_admission_handoffs_write_staff"
  on public.lead_admission_handoffs for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "lead_admission_handoff_checklist_select_staff" on public.lead_admission_handoff_checklist_items;
create policy "lead_admission_handoff_checklist_select_staff"
  on public.lead_admission_handoff_checklist_items for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent', 'recruiter', 'dispatch', 'billing', 'credentialing', 'don')
    )
  );

drop policy if exists "lead_admission_handoff_checklist_write_staff" on public.lead_admission_handoff_checklist_items;
create policy "lead_admission_handoff_checklist_write_staff"
  on public.lead_admission_handoff_checklist_items for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
