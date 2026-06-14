-- Phase 24 Step 1: Universal printed referral QR — source links, events, lead review fields.

-- ---------------------------------------------------------------------------
-- Leads: referral source review (printed QR matching)
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists needs_referral_source_review boolean not null default false,
  add column if not exists referral_source_match_confidence numeric,
  add column if not exists referral_source_match_reason text;

create index if not exists leads_needs_referral_source_review_idx
  on public.leads (needs_referral_source_review)
  where needs_referral_source_review = true and deleted_at is null;

create index if not exists leads_referral_source_match_confidence_idx
  on public.leads (referral_source_match_confidence)
  where referral_source_match_confidence is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Source link tokens (universal, facility, campaign, packet — Step 1 seeds universal)
-- ---------------------------------------------------------------------------

create table if not exists public.facility_referral_source_links (
  id uuid primary key default gen_random_uuid(),
  token text unique,
  facility_id uuid null references public.facilities (id) on delete set null,
  contact_id uuid null references public.facility_contacts (id) on delete set null,
  campaign_id uuid null references public.facility_campaigns (id) on delete set null,
  campaign_enrollment_id uuid null references public.facility_campaign_enrollments (id) on delete set null,
  packet_request_id uuid null references public.facility_packet_requests (id) on delete set null,
  packet_material_id uuid null references public.facility_packet_materials (id) on delete set null,
  route_plan_id uuid null references public.facility_route_plans (id) on delete set null,
  route_stop_id uuid null references public.facility_route_stops (id) on delete set null,
  activity_id uuid null references public.facility_activities (id) on delete set null,
  sales_rep_id uuid null references auth.users (id) on delete set null,
  link_type text not null default 'universal',
  label text null,
  destination_url text null,
  status text not null default 'active',
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz null,
  use_count integer not null default 0,
  metadata jsonb null default '{}'::jsonb,
  constraint facility_referral_source_links_link_type_check
    check (
      link_type in (
        'universal',
        'facility',
        'contact',
        'campaign',
        'packet',
        'material',
        'route',
        'activity',
        'rep',
        'custom'
      )
    ),
  constraint facility_referral_source_links_status_check
    check (status in ('active', 'inactive', 'archived'))
);

create index if not exists facility_referral_source_links_link_type_idx
  on public.facility_referral_source_links (link_type);

create index if not exists facility_referral_source_links_facility_id_idx
  on public.facility_referral_source_links (facility_id)
  where facility_id is not null;

create index if not exists facility_referral_source_links_status_idx
  on public.facility_referral_source_links (status);

-- ---------------------------------------------------------------------------
-- Source link events (views, submissions — no PHI in metadata)
-- ---------------------------------------------------------------------------

create table if not exists public.facility_referral_source_link_events (
  id uuid primary key default gen_random_uuid(),
  source_link_id uuid null references public.facility_referral_source_links (id) on delete set null,
  token text null,
  event_type text not null,
  facility_id uuid null references public.facilities (id) on delete set null,
  contact_id uuid null references public.facility_contacts (id) on delete set null,
  campaign_id uuid null references public.facility_campaigns (id) on delete set null,
  sales_rep_id uuid null references auth.users (id) on delete set null,
  lead_id uuid null references public.leads (id) on delete set null,
  ip_hash text null,
  user_agent text null,
  referrer text null,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint facility_referral_source_link_events_event_type_check
    check (
      event_type in (
        'view',
        'form_started',
        'form_submitted',
        'lead_created',
        'link_copied',
        'qr_downloaded'
      )
    )
);

create index if not exists facility_referral_source_link_events_source_link_id_idx
  on public.facility_referral_source_link_events (source_link_id);

create index if not exists facility_referral_source_link_events_event_type_idx
  on public.facility_referral_source_link_events (event_type);

create index if not exists facility_referral_source_link_events_created_at_idx
  on public.facility_referral_source_link_events (created_at desc);

create index if not exists facility_referral_source_link_events_ip_hash_idx
  on public.facility_referral_source_link_events (ip_hash, created_at desc)
  where ip_hash is not null;

-- ---------------------------------------------------------------------------
-- updated_at trigger for source links
-- ---------------------------------------------------------------------------

create or replace function public.touch_facility_referral_source_links_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists facility_referral_source_links_updated_at on public.facility_referral_source_links;
create trigger facility_referral_source_links_updated_at
  before update on public.facility_referral_source_links
  for each row
  execute function public.touch_facility_referral_source_links_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: staff read only (writes via service role from API)
-- ---------------------------------------------------------------------------

alter table public.facility_referral_source_links enable row level security;
alter table public.facility_referral_source_link_events enable row level security;

drop policy if exists "facility_referral_source_links_select_staff" on public.facility_referral_source_links;
create policy "facility_referral_source_links_select_staff"
  on public.facility_referral_source_links for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.is_active = true
    )
  );

drop policy if exists "facility_referral_source_link_events_select_staff" on public.facility_referral_source_link_events;
create policy "facility_referral_source_link_events_select_staff"
  on public.facility_referral_source_link_events for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid() and sp.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- Seed universal printed QR link (one QR for all general materials)
-- ---------------------------------------------------------------------------

insert into public.facility_referral_source_links (
  link_type,
  label,
  destination_url,
  status,
  metadata
)
select
  'universal',
  'Universal printed referral QR',
  '/refer',
  'active',
  '{"source":"printed_materials"}'::jsonb
where not exists (
  select 1
  from public.facility_referral_source_links
  where link_type = 'universal' and token is null and status = 'active'
);

comment on table public.facility_referral_source_links is
  'Trackable referral URLs/QR tokens — universal print, campaign, facility, packet.';
comment on table public.facility_referral_source_link_events is
  'Anonymous referral link engagement events (no PHI in metadata).';
