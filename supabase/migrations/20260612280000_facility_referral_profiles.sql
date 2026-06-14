-- Phase 23: Referral source profile + contact intelligence flags.

create table if not exists public.facility_referral_profiles (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null unique references public.facilities (id) on delete cascade,
  relationship_status text null,
  referral_potential text null,
  best_contact_id uuid null references public.facility_contacts (id) on delete set null,
  referral_process text null,
  preferred_contact_method text null,
  preferred_packet_method text null,
  preferred_referral_method text null,
  referral_fax text null,
  referral_email text null,
  referral_phone text null,
  services_likely_to_refer text[] null,
  payer_notes text null,
  insurance_notes text null,
  decision_maker_name text null,
  decision_maker_role text null,
  gatekeeper_notes text null,
  objections text null,
  opportunities text null,
  next_best_action text null,
  next_best_action_due_at timestamptz null,
  last_profile_ai_summary text null,
  ai_confidence numeric null,
  profile_json jsonb null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_referral_profiles_relationship_status_check
    check (
      relationship_status is null
      or relationship_status in (
        'New', 'Cold', 'Warm', 'Good', 'Strong', 'Dormant', 'Not Interested', 'Do Not Contact'
      )
    ),
  constraint facility_referral_profiles_referral_potential_check
    check (
      referral_potential is null
      or referral_potential in ('Cold', 'Warm', 'Hot', 'Active Producer', 'Not Interested')
    ),
  constraint facility_referral_profiles_preferred_contact_method_check
    check (
      preferred_contact_method is null
      or preferred_contact_method in ('phone', 'fax', 'email', 'portal', 'in_person', 'unknown')
    ),
  constraint facility_referral_profiles_preferred_packet_method_check
    check (
      preferred_packet_method is null
      or preferred_packet_method in ('phone', 'fax', 'email', 'portal', 'in_person', 'unknown')
    ),
  constraint facility_referral_profiles_preferred_referral_method_check
    check (
      preferred_referral_method is null
      or preferred_referral_method in ('phone', 'fax', 'email', 'portal', 'in_person', 'unknown')
    )
);

create index if not exists facility_referral_profiles_facility_id_idx
  on public.facility_referral_profiles (facility_id);

create index if not exists facility_referral_profiles_referral_potential_idx
  on public.facility_referral_profiles (referral_potential);

create index if not exists facility_referral_profiles_next_best_action_due_idx
  on public.facility_referral_profiles (next_best_action_due_at);

create or replace function public.touch_facility_referral_profiles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists facility_referral_profiles_updated_at on public.facility_referral_profiles;
create trigger facility_referral_profiles_updated_at
  before update on public.facility_referral_profiles
  for each row execute function public.touch_facility_referral_profiles_updated_at();

alter table public.facility_referral_profiles enable row level security;

drop policy if exists "facility_referral_profiles_select_staff" on public.facility_referral_profiles;
create policy "facility_referral_profiles_select_staff"
  on public.facility_referral_profiles for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent', 'recruiter', 'billing', 'dispatch', 'credentialing', 'don')
    )
  );

-- Contact intelligence flags
alter table public.facility_contacts
  add column if not exists is_best_contact boolean not null default false,
  add column if not exists is_gatekeeper boolean not null default false,
  add column if not exists is_referral_contact boolean not null default false,
  add column if not exists contact_notes text null;

comment on table public.facility_referral_profiles is
  'Referral source intelligence profile per facility — how referrals are sent and relationship context.';
