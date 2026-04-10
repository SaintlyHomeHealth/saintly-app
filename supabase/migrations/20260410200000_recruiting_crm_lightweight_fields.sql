-- Recruiting CRM: lightweight prospecting + reactivation fields (not full onboarding).
-- Requires public.recruiting_candidates (20260410100000 or 20260410163000). IF EXISTS avoids hard errors if run alone.

alter table if exists public.recruiting_candidates
  add column if not exists interest_level text;

alter table if exists public.recruiting_candidates
  add column if not exists last_response_at timestamptz;

alter table if exists public.recruiting_candidates
  add column if not exists sms_opt_out boolean not null default false;

alter table if exists public.recruiting_candidates
  add column if not exists sms_opt_out_at timestamptz;

alter table if exists public.recruiting_candidates
  add column if not exists preferred_contact_method text;

alter table if exists public.recruiting_candidates
  add column if not exists follow_up_bucket text;

alter table if exists public.recruiting_candidates
  add column if not exists specialties text;

alter table if exists public.recruiting_candidates
  add column if not exists recruiting_tags text;

do $recruiting_light$
begin
  if to_regclass('public.recruiting_candidates') is null then
    raise notice 'Skipping lightweight indexes/comments: recruiting_candidates not found. Apply 20260410100000 or 20260410163000 first.';
    return;
  end if;

  execute $ix1$
    create index if not exists recruiting_candidates_interest_level_idx on public.recruiting_candidates (interest_level)
  $ix1$;
  execute $ix2$
    create index if not exists recruiting_candidates_city_idx on public.recruiting_candidates (city)
  $ix2$;
  execute $ix3$
    create index if not exists recruiting_candidates_recruiting_tags_idx on public.recruiting_candidates (recruiting_tags)
  $ix3$;

  execute $c1$
    comment on column public.recruiting_candidates.interest_level is 'Prospect heat: hot, warm, cold, maybe_later.';
  $c1$;
  execute $c2$
    comment on column public.recruiting_candidates.last_response_at is 'Last time the candidate meaningfully responded (best-effort).';
  $c2$;
  execute $c3$
    comment on column public.recruiting_candidates.sms_opt_out is 'Do not send marketing/recruiting SMS.';
  $c3$;
  execute $c4$
    comment on column public.recruiting_candidates.preferred_contact_method is 'call, text, email, etc.';
  $c4$;
  execute $c5$
    comment on column public.recruiting_candidates.follow_up_bucket is 'Optional nurture bucket label (e.g. East Valley PRN).';
  $c5$;
  execute $c6$
    comment on column public.recruiting_candidates.specialties is 'Free-text clinical focus for filtering.';
  $c6$;
  execute $c7$
    comment on column public.recruiting_candidates.recruiting_tags is 'Comma or free-text tags for future area/campaign filters.';
  $c7$;
end;
$recruiting_light$;
