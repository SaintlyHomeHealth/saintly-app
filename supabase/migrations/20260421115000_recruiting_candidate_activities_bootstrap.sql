-- Timeline rows for Recruiting CRM (notes, calls, resume events).
-- Production may have `recruiting_candidates` (e.g. from 20260410100000) but never ran
-- `20260410163000_recruiting_crm.sql`, so `recruiting_candidate_activities` was missing.
-- This migration is safe if the table already exists (IF NOT EXISTS + idempotent indexes).

create table if not exists public.recruiting_candidate_activities (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.recruiting_candidates (id) on delete cascade,
  activity_type text not null,
  outcome text,
  body text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists recruiting_candidate_activities_candidate_id_idx
  on public.recruiting_candidate_activities (candidate_id);

create index if not exists recruiting_candidate_activities_created_at_idx
  on public.recruiting_candidate_activities (created_at desc);

create index if not exists recruiting_candidate_activities_outcome_idx
  on public.recruiting_candidate_activities (outcome);

alter table public.recruiting_candidate_activities enable row level security;

comment on table public.recruiting_candidate_activities is
  'Append-only recruiting CRM timeline (manual notes, quick actions, resume pipeline events).';
