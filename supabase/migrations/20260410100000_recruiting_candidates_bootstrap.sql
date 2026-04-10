-- Recruiting CRM: ensure `recruiting_candidates` exists with the full column set before later migrations.
-- Run before 20260410163000 in `supabase db push` order. Safe if 20260410163000 already created the table (IF NOT EXISTS = no-op).
-- Fixes: ALTER-only migrations (resume / lightweight / normalized) failing with "relation does not exist"
-- when applied in the SQL editor without the base recruiting CRM migration.

create table if not exists public.recruiting_candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text,
  last_name text,
  phone text,
  email text,
  city text,
  state text,
  zip text,
  coverage_area text,
  discipline text,
  source text not null default 'Indeed',
  status text not null default 'New',
  assigned_to uuid references auth.users (id) on delete set null,
  indeed_url text,
  resume_url text,
  notes text,
  last_call_at timestamptz,
  last_text_at timestamptz,
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resume_file_name text,
  resume_storage_path text,
  resume_uploaded_at timestamptz,
  interest_level text,
  last_response_at timestamptz,
  sms_opt_out boolean not null default false,
  sms_opt_out_at timestamptz,
  preferred_contact_method text,
  follow_up_bucket text,
  specialties text,
  recruiting_tags text,
  normalized_email text,
  normalized_phone text,
  name_city_key text
);

create index if not exists recruiting_candidates_status_idx on public.recruiting_candidates (status);
create index if not exists recruiting_candidates_discipline_idx on public.recruiting_candidates (discipline);
create index if not exists recruiting_candidates_coverage_area_idx on public.recruiting_candidates (coverage_area);
create index if not exists recruiting_candidates_source_idx on public.recruiting_candidates (source);
create index if not exists recruiting_candidates_next_follow_up_at_idx on public.recruiting_candidates (next_follow_up_at);
create index if not exists recruiting_candidates_last_contact_at_idx on public.recruiting_candidates (last_contact_at desc);
create index if not exists recruiting_candidates_assigned_to_idx on public.recruiting_candidates (assigned_to);
create index if not exists recruiting_candidates_interest_level_idx on public.recruiting_candidates (interest_level);
create index if not exists recruiting_candidates_city_idx on public.recruiting_candidates (city);
create index if not exists recruiting_candidates_recruiting_tags_idx on public.recruiting_candidates (recruiting_tags);
create index if not exists recruiting_candidates_normalized_email_idx
  on public.recruiting_candidates (normalized_email)
  where normalized_email is not null;
create index if not exists recruiting_candidates_normalized_phone_idx
  on public.recruiting_candidates (normalized_phone)
  where normalized_phone is not null;
create index if not exists recruiting_candidates_name_city_key_idx
  on public.recruiting_candidates (name_city_key)
  where name_city_key is not null;

comment on column public.recruiting_candidates.resume_file_name is 'Original filename of the uploaded resume.';
comment on column public.recruiting_candidates.resume_storage_path is 'Object path in Storage bucket recruiting-resumes.';
comment on column public.recruiting_candidates.resume_uploaded_at is 'When the current resume file was uploaded.';
comment on column public.recruiting_candidates.interest_level is 'Prospect heat: hot, warm, cold, maybe_later.';
comment on column public.recruiting_candidates.last_response_at is 'Last time the candidate meaningfully responded (best-effort).';
comment on column public.recruiting_candidates.sms_opt_out is 'Do not send marketing/recruiting SMS.';
comment on column public.recruiting_candidates.preferred_contact_method is 'call, text, email, etc.';
comment on column public.recruiting_candidates.follow_up_bucket is 'Optional nurture bucket label (e.g. East Valley PRN).';
comment on column public.recruiting_candidates.specialties is 'Free-text clinical focus for filtering.';
comment on column public.recruiting_candidates.recruiting_tags is 'Comma or free-text tags for future area/campaign filters.';
comment on column public.recruiting_candidates.normalized_email is 'lower(trim(email)) for duplicate checks.';
comment on column public.recruiting_candidates.normalized_phone is 'Canonical digit string (10-digit NANP when applicable).';
comment on column public.recruiting_candidates.name_city_key is 'lower(trim(full_name))|lower(trim(city)) when both present; soft duplicate.';
