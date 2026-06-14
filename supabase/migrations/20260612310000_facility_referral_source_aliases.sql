-- Phase 24 Step 4: Referral source aliases for improved public-form matching.

create table if not exists public.facility_referral_source_aliases (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  contact_id uuid null references public.facility_contacts (id) on delete set null,
  alias_name text null,
  alias_phone text null,
  alias_email_domain text null,
  alias_city text null,
  created_from_lead_id uuid null references public.leads (id) on delete set null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists facility_referral_source_aliases_facility_id_idx
  on public.facility_referral_source_aliases (facility_id);

create index if not exists facility_referral_source_aliases_alias_name_idx
  on public.facility_referral_source_aliases (lower(alias_name))
  where alias_name is not null;

create index if not exists facility_referral_source_aliases_alias_phone_idx
  on public.facility_referral_source_aliases (alias_phone)
  where alias_phone is not null;

alter table public.facility_referral_source_aliases enable row level security;
