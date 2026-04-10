-- Recruiting CRM: lightweight prospecting + reactivation fields (not full onboarding).

alter table public.recruiting_candidates
  add column if not exists interest_level text;

alter table public.recruiting_candidates
  add column if not exists last_response_at timestamptz;

alter table public.recruiting_candidates
  add column if not exists sms_opt_out boolean not null default false;

alter table public.recruiting_candidates
  add column if not exists sms_opt_out_at timestamptz;

alter table public.recruiting_candidates
  add column if not exists preferred_contact_method text;

alter table public.recruiting_candidates
  add column if not exists follow_up_bucket text;

alter table public.recruiting_candidates
  add column if not exists specialties text;

alter table public.recruiting_candidates
  add column if not exists recruiting_tags text;

create index if not exists recruiting_candidates_interest_level_idx on public.recruiting_candidates (interest_level);
create index if not exists recruiting_candidates_city_idx on public.recruiting_candidates (city);
create index if not exists recruiting_candidates_recruiting_tags_idx on public.recruiting_candidates (recruiting_tags);

comment on column public.recruiting_candidates.interest_level is 'Prospect heat: hot, warm, cold, maybe_later.';
comment on column public.recruiting_candidates.last_response_at is 'Last time the candidate meaningfully responded (best-effort).';
comment on column public.recruiting_candidates.sms_opt_out is 'Do not send marketing/recruiting SMS.';
comment on column public.recruiting_candidates.preferred_contact_method is 'call, text, email, etc.';
comment on column public.recruiting_candidates.follow_up_bucket is 'Optional nurture bucket label (e.g. East Valley PRN).';
comment on column public.recruiting_candidates.specialties is 'Free-text clinical focus for filtering.';
comment on column public.recruiting_candidates.recruiting_tags is 'Comma or free-text tags for future area/campaign filters.';
