-- Phase 13: Facility outreach → CRM lead referral attribution.

-- ---------------------------------------------------------------------------
-- Leads: facility referral attribution
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists referring_facility_id uuid references public.facilities (id) on delete set null,
  add column if not exists referring_facility_contact_id uuid references public.facility_contacts (id) on delete set null,
  add column if not exists referring_facility_activity_id uuid references public.facility_activities (id) on delete set null,
  add column if not exists referral_source_type text,
  add column if not exists referral_received_at timestamptz,
  add column if not exists referral_attribution_json jsonb,
  add column if not exists produced_by_user_id uuid references auth.users (id) on delete set null;

create index if not exists leads_referring_facility_id_idx
  on public.leads (referring_facility_id)
  where referring_facility_id is not null and deleted_at is null;

create index if not exists leads_referring_facility_contact_id_idx
  on public.leads (referring_facility_contact_id)
  where referring_facility_contact_id is not null and deleted_at is null;

create index if not exists leads_referring_facility_activity_id_idx
  on public.leads (referring_facility_activity_id)
  where referring_facility_activity_id is not null and deleted_at is null;

create index if not exists leads_produced_by_user_id_idx
  on public.leads (produced_by_user_id)
  where produced_by_user_id is not null and deleted_at is null;

create index if not exists leads_referral_received_at_idx
  on public.leads (referral_received_at desc)
  where referral_received_at is not null and deleted_at is null;

create index if not exists leads_referral_source_type_idx
  on public.leads (referral_source_type)
  where referral_source_type is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Patients: mirror facility attribution on convert
-- ---------------------------------------------------------------------------

alter table public.patients
  add column if not exists referring_facility_id uuid references public.facilities (id) on delete set null,
  add column if not exists referring_facility_contact_id uuid references public.facility_contacts (id) on delete set null;

create index if not exists patients_referring_facility_id_idx
  on public.patients (referring_facility_id)
  where referring_facility_id is not null;

-- ---------------------------------------------------------------------------
-- Facility activities: link to CRM lead
-- ---------------------------------------------------------------------------

alter table public.facility_activities
  add column if not exists linked_lead_id uuid references public.leads (id) on delete set null,
  add column if not exists linked_patient_id uuid references public.patients (id) on delete set null,
  add column if not exists referral_created boolean not null default false;

create index if not exists facility_activities_linked_lead_id_idx
  on public.facility_activities (linked_lead_id)
  where linked_lead_id is not null;

-- ---------------------------------------------------------------------------
-- Facilities: last referral timestamp
-- ---------------------------------------------------------------------------

alter table public.facilities
  add column if not exists last_referral_at timestamptz;

create index if not exists facilities_last_referral_at_idx
  on public.facilities (last_referral_at desc)
  where last_referral_at is not null;

-- ---------------------------------------------------------------------------
-- Lead source: facility_outreach
-- ---------------------------------------------------------------------------

alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (
    source in (
      'phone',
      'facebook',
      'facebook_ads',
      'facebook_lead_ads',
      'google',
      'hospital',
      'other',
      'manual',
      'walk_in',
      'referral',
      'email_referral',
      'email_inquiry',
      'sales_agent',
      'facility_outreach'
    )
  );

-- ---------------------------------------------------------------------------
-- Follow-up task source: facility_referral
-- ---------------------------------------------------------------------------

alter table public.facility_follow_up_tasks
  drop constraint if exists facility_follow_up_tasks_source_check;

alter table public.facility_follow_up_tasks
  add constraint facility_follow_up_tasks_source_check
  check (
    source is null
    or source in (
      'quick_log',
      'ai_capture',
      'manual',
      'photo_note',
      'advanced_log',
      'facility_referral'
    )
  );

comment on column public.leads.referring_facility_id is 'Facility CRM facility that produced this referral lead';
comment on column public.leads.referral_attribution_json is 'Structured facility outreach attribution metadata';
