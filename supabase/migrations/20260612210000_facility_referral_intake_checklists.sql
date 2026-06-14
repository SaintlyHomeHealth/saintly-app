-- Phase 14: Facility referral intake checklist + conversion loop.

create table if not exists public.facility_referral_intake_checklists (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  referring_facility_id uuid references public.facilities (id) on delete set null,
  patient_contacted boolean not null default false,
  insurance_verified boolean not null default false,
  service_need_confirmed boolean not null default false,
  orders_requested boolean not null default false,
  f2f_requested boolean not null default false,
  packet_received boolean not null default false,
  soc_availability_checked boolean not null default false,
  clinician_scheduling_started boolean not null default false,
  referral_source_updated boolean not null default false,
  converted_or_closed boolean not null default false,
  checklist_json jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_referral_intake_checklists_lead_id_key unique (lead_id)
);

create index if not exists facility_referral_intake_checklists_lead_id_idx
  on public.facility_referral_intake_checklists (lead_id);

create index if not exists facility_referral_intake_checklists_facility_id_idx
  on public.facility_referral_intake_checklists (referring_facility_id)
  where referring_facility_id is not null;

alter table public.facility_referral_intake_checklists enable row level security;

drop policy if exists "facility_referral_intake_checklists_select_staff" on public.facility_referral_intake_checklists;
create policy "facility_referral_intake_checklists_select_staff"
  on public.facility_referral_intake_checklists for select to authenticated
  using (exists (select 1 from public.staff_profiles sp where sp.user_id = auth.uid()));

drop policy if exists "facility_referral_intake_checklists_insert_staff" on public.facility_referral_intake_checklists;
create policy "facility_referral_intake_checklists_insert_staff"
  on public.facility_referral_intake_checklists for insert to authenticated
  with check (exists (select 1 from public.staff_profiles sp where sp.user_id = auth.uid()));

drop policy if exists "facility_referral_intake_checklists_update_staff" on public.facility_referral_intake_checklists;
create policy "facility_referral_intake_checklists_update_staff"
  on public.facility_referral_intake_checklists for update to authenticated
  using (exists (select 1 from public.staff_profiles sp where sp.user_id = auth.uid()));

comment on table public.facility_referral_intake_checklists is 'Intake checklist for facility-sourced CRM referral leads';
