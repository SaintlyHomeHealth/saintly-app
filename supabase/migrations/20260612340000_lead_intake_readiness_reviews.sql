-- Phase 27: Intake readiness review + accept/decline workflow.

create table if not exists public.lead_intake_readiness_reviews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  readiness_status text not null default 'needs_review',
  readiness_score integer,
  decision text,
  payer_status text,
  document_status text,
  clinical_status text,
  service_area_status text,
  staffing_status text,
  missing_items jsonb,
  blockers jsonb,
  warnings jsonb,
  suggested_next_action text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  declined_by uuid references auth.users (id) on delete set null,
  declined_at timestamptz,
  decline_reason text,
  notes text,
  ai_summary text,
  ai_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_intake_readiness_reviews_readiness_status_check
    check (
      readiness_status in (
        'needs_review',
        'ready',
        'needs_info',
        'needs_clinical_review',
        'needs_payer_review',
        'needs_staffing_review',
        'cannot_accept',
        'accepted',
        'declined'
      )
    ),
  constraint lead_intake_readiness_reviews_decision_check
    check (
      decision is null
      or decision in (
        'pending',
        'request_info',
        'clinical_review',
        'payer_review',
        'staffing_review',
        'accept',
        'decline',
        'hold'
      )
    ),
  constraint lead_intake_readiness_reviews_payer_status_check
    check (
      payer_status is null
      or payer_status in ('unknown', 'acceptable', 'needs_verification', 'out_of_network', 'not_accepted')
    ),
  constraint lead_intake_readiness_reviews_document_status_check
    check (
      document_status is null
      or document_status in ('missing', 'partial', 'complete', 'needs_review')
    ),
  constraint lead_intake_readiness_reviews_clinical_status_check
    check (
      clinical_status is null
      or clinical_status in ('unknown', 'appears_appropriate', 'needs_clinical_review', 'not_appropriate')
    ),
  constraint lead_intake_readiness_reviews_service_area_status_check
    check (
      service_area_status is null
      or service_area_status in ('unknown', 'in_area', 'out_of_area', 'needs_review')
    ),
  constraint lead_intake_readiness_reviews_staffing_status_check
    check (
      staffing_status is null
      or staffing_status in ('unknown', 'available', 'limited', 'unavailable', 'needs_review')
    )
);

create unique index if not exists lead_intake_readiness_reviews_lead_id_uidx
  on public.lead_intake_readiness_reviews (lead_id);

create index if not exists lead_intake_readiness_reviews_readiness_status_idx
  on public.lead_intake_readiness_reviews (readiness_status);

create index if not exists lead_intake_readiness_reviews_decision_idx
  on public.lead_intake_readiness_reviews (decision)
  where decision is not null;

create index if not exists lead_intake_readiness_reviews_payer_status_idx
  on public.lead_intake_readiness_reviews (payer_status)
  where payer_status is not null;

create index if not exists lead_intake_readiness_reviews_document_status_idx
  on public.lead_intake_readiness_reviews (document_status)
  where document_status is not null;

create index if not exists lead_intake_readiness_reviews_created_at_idx
  on public.lead_intake_readiness_reviews (created_at desc);

create index if not exists lead_intake_readiness_reviews_updated_at_idx
  on public.lead_intake_readiness_reviews (updated_at desc);

comment on table public.lead_intake_readiness_reviews is
  'Intake readiness assessment for referral leads; staff-driven accept/decline decisions.';

alter table public.lead_intake_readiness_reviews enable row level security;

drop policy if exists "lead_intake_readiness_reviews_select_staff" on public.lead_intake_readiness_reviews;
create policy "lead_intake_readiness_reviews_select_staff"
  on public.lead_intake_readiness_reviews for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent', 'recruiter', 'dispatch', 'billing', 'credentialing', 'don')
    )
  );

drop policy if exists "lead_intake_readiness_reviews_write_staff" on public.lead_intake_readiness_reviews;
create policy "lead_intake_readiness_reviews_write_staff"
  on public.lead_intake_readiness_reviews for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
