-- PT/PTA recruiting cold-calling: clinic call targets sourced from Google Places + call history.
-- This is a recruiting/employment sourcing tracker. It is intentionally SEPARATE from
-- patient leads, private pay, referral sources, and the general facilities CRM.

create table if not exists public.recruiting_call_targets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  clinic_name text not null,
  google_place_id text,
  phone text,
  normalized_phone text,
  website text,
  website_domain text,
  address text,
  city text,
  state text,
  zip_code text,
  latitude double precision,
  longitude double precision,
  google_rating numeric,
  google_review_count integer,
  google_maps_url text,
  source text not null default 'google_places',
  lead_category text not null default 'employment',
  pipeline text not null default 'pt_cold_calling',
  recruiting_type text not null default 'pt_clinic_cold_call',
  discipline_target text not null default 'PT/PTA',
  status text not null default 'New',
  contact_person text,
  contact_title text,
  recruiter_notes text,
  call_attempts integer not null default 0,
  last_called_at timestamptz,
  next_follow_up_at timestamptz,
  follow_up_reason text,
  outcome text,
  do_not_call boolean not null default false,
  -- Optional link to a real recruiting candidate once a person is identified.
  converted_candidate_id uuid references public.recruiting_candidates (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null
);

create unique index if not exists recruiting_call_targets_google_place_id_uidx
  on public.recruiting_call_targets (google_place_id)
  where google_place_id is not null;

create index if not exists recruiting_call_targets_normalized_phone_idx
  on public.recruiting_call_targets (normalized_phone)
  where normalized_phone is not null;

create index if not exists recruiting_call_targets_website_domain_idx
  on public.recruiting_call_targets (website_domain)
  where website_domain is not null;

create index if not exists recruiting_call_targets_status_idx on public.recruiting_call_targets (status);
create index if not exists recruiting_call_targets_next_follow_up_at_idx on public.recruiting_call_targets (next_follow_up_at);
create index if not exists recruiting_call_targets_zip_code_idx on public.recruiting_call_targets (zip_code);

comment on table public.recruiting_call_targets is 'PT/PTA cold-calling targets: physical therapy clinics sourced via Google Places for recruiting outreach. Separate from patient leads / referral sources / facilities CRM.';
comment on column public.recruiting_call_targets.google_place_id is 'Google Places API place id, primary deduplication key';
comment on column public.recruiting_call_targets.normalized_phone is 'Digits-only phone (US leading 1 stripped) for dedup';
comment on column public.recruiting_call_targets.website_domain is 'Normalized website host for dedup';
comment on column public.recruiting_call_targets.converted_candidate_id is 'Linked recruiting_candidates row if this clinic produced a real candidate';

create table if not exists public.recruiting_call_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  target_id uuid not null references public.recruiting_call_targets (id) on delete cascade,
  call_date date,
  call_time text,
  called_at timestamptz not null default now(),
  person_spoke_with text,
  person_title text,
  call_outcome text,
  status_set text,
  notes text,
  next_follow_up_at timestamptz,
  staff_user_id uuid references auth.users (id) on delete set null
);

create index if not exists recruiting_call_logs_target_id_idx on public.recruiting_call_logs (target_id);
create index if not exists recruiting_call_logs_called_at_idx on public.recruiting_call_logs (called_at desc);

comment on table public.recruiting_call_logs is 'Call history for PT/PTA cold-calling targets (one row per call/note).';

-- updated_at trigger
create or replace function public.touch_recruiting_call_targets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recruiting_call_targets_updated_at on public.recruiting_call_targets;
create trigger recruiting_call_targets_updated_at
  before update on public.recruiting_call_targets
  for each row
  execute function public.touch_recruiting_call_targets_updated_at();

-- RLS: recruiting-tier staff (manager / admin / super_admin / recruiter / don / dispatch / billing / credentialing).
alter table public.recruiting_call_targets enable row level security;
alter table public.recruiting_call_logs enable row level security;

drop policy if exists "recruiting_call_targets_select_staff" on public.recruiting_call_targets;
create policy "recruiting_call_targets_select_staff"
  on public.recruiting_call_targets for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'recruiter', 'don', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "recruiting_call_targets_insert_staff" on public.recruiting_call_targets;
create policy "recruiting_call_targets_insert_staff"
  on public.recruiting_call_targets for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'recruiter', 'don', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "recruiting_call_targets_update_staff" on public.recruiting_call_targets;
create policy "recruiting_call_targets_update_staff"
  on public.recruiting_call_targets for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'recruiter', 'don', 'dispatch', 'billing', 'credentialing')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'recruiter', 'don', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "recruiting_call_targets_delete_staff" on public.recruiting_call_targets;
create policy "recruiting_call_targets_delete_staff"
  on public.recruiting_call_targets for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "recruiting_call_logs_select_staff" on public.recruiting_call_logs;
create policy "recruiting_call_logs_select_staff"
  on public.recruiting_call_logs for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'recruiter', 'don', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "recruiting_call_logs_insert_staff" on public.recruiting_call_logs;
create policy "recruiting_call_logs_insert_staff"
  on public.recruiting_call_logs for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'recruiter', 'don', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "recruiting_call_logs_update_staff" on public.recruiting_call_logs;
create policy "recruiting_call_logs_update_staff"
  on public.recruiting_call_logs for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'recruiter', 'don', 'dispatch', 'billing', 'credentialing')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'recruiter', 'don', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "recruiting_call_logs_delete_staff" on public.recruiting_call_logs;
create policy "recruiting_call_logs_delete_staff"
  on public.recruiting_call_logs for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
