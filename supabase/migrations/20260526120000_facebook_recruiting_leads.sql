-- Facebook PT hiring lead form intake (separate from patient CRM leads and Indeed recruiting_candidates).

create table if not exists public.facebook_recruiting_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  city text,
  form_name text,
  license_status text,
  home_health_experience text,
  visits_per_week text,
  coverage_area text,
  start_date text,
  contact_preference text,
  lead_type text not null default 'PT Hiring',
  source text not null default 'Facebook Lead Form',
  status text not null default 'New',
  notes text,
  raw_payload jsonb,
  normalized_phone text,
  normalized_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facebook_recruiting_leads_status_check check (
    status in (
      'New',
      'Contacted',
      'Interview Scheduled',
      'Credentialing',
      'Hired',
      'Not Qualified',
      'No Response'
    )
  )
);

create index if not exists facebook_recruiting_leads_status_idx
  on public.facebook_recruiting_leads (status);

create index if not exists facebook_recruiting_leads_created_at_idx
  on public.facebook_recruiting_leads (created_at desc);

create index if not exists facebook_recruiting_leads_coverage_area_idx
  on public.facebook_recruiting_leads (coverage_area)
  where coverage_area is not null;

create index if not exists facebook_recruiting_leads_license_status_idx
  on public.facebook_recruiting_leads (license_status)
  where license_status is not null;

create unique index if not exists facebook_recruiting_leads_normalized_phone_uidx
  on public.facebook_recruiting_leads (normalized_phone)
  where normalized_phone is not null;

create unique index if not exists facebook_recruiting_leads_normalized_email_uidx
  on public.facebook_recruiting_leads (normalized_email)
  where normalized_email is not null;

comment on table public.facebook_recruiting_leads is
  'PT hiring applicants from Facebook Lead Ads (Zapier webhook). Separate from patient leads and Indeed recruiting_candidates.';

comment on column public.facebook_recruiting_leads.raw_payload is
  'JSON snapshot: { latest, history[] } of webhook submissions.';

comment on column public.facebook_recruiting_leads.normalized_phone is
  '10-digit NANP for dedupe; unique when present.';

comment on column public.facebook_recruiting_leads.normalized_email is
  'lower(trim(email)) for dedupe; unique when present.';

create or replace function public.touch_facebook_recruiting_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists facebook_recruiting_leads_updated_at on public.facebook_recruiting_leads;
create trigger facebook_recruiting_leads_updated_at
  before update on public.facebook_recruiting_leads
  for each row
  execute function public.touch_facebook_recruiting_leads_updated_at();

alter table public.facebook_recruiting_leads enable row level security;

drop policy if exists "facebook_recruiting_leads_select_staff" on public.facebook_recruiting_leads;
create policy "facebook_recruiting_leads_select_staff"
  on public.facebook_recruiting_leads for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "facebook_recruiting_leads_insert_staff" on public.facebook_recruiting_leads;
create policy "facebook_recruiting_leads_insert_staff"
  on public.facebook_recruiting_leads for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "facebook_recruiting_leads_update_staff" on public.facebook_recruiting_leads;
create policy "facebook_recruiting_leads_update_staff"
  on public.facebook_recruiting_leads for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "facebook_recruiting_leads_delete_staff" on public.facebook_recruiting_leads;
create policy "facebook_recruiting_leads_delete_staff"
  on public.facebook_recruiting_leads for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );
