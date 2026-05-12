-- Some environments never applied `20260403120000_phone_calls_workspace_missed_followup_resolved.sql`.
-- Without this column, PostgREST errors on selects that list it and workspace Calls renders empty.

alter table public.phone_calls
  add column if not exists workspace_missed_followup_resolved_at timestamptz null;

comment on column public.phone_calls.workspace_missed_followup_resolved_at is
  'When set, workspace Calls can hide a missed row from the follow-up queue without changing status.';

create index if not exists phone_calls_workspace_missed_unresolved_idx
  on public.phone_calls (updated_at desc nulls last)
  where status = 'missed' and workspace_missed_followup_resolved_at is null;
