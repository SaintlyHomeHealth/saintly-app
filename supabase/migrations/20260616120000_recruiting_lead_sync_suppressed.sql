-- Prevent lazy candidate sync from recreating a recruiting lead after admin hard delete.

alter table public.recruiting_candidates
  add column if not exists recruiting_lead_sync_suppressed boolean not null default false;

create index if not exists recruiting_candidates_sync_suppressed_idx
  on public.recruiting_candidates (recruiting_lead_sync_suppressed)
  where recruiting_lead_sync_suppressed = true;

comment on column public.recruiting_candidates.recruiting_lead_sync_suppressed is
  'When true, syncRecruitingLeadForCandidate must not recreate facebook_recruiting_leads for this candidate.';
