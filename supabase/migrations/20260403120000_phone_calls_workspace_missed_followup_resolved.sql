-- Workspace-only: hide a missed call from the nurse "needs attention" queue without changing
-- phone_calls.status (admin call log and reporting stay accurate).

alter table public.phone_calls
  add column if not exists workspace_missed_followup_resolved_at timestamptz null;

comment on column public.phone_calls.workspace_missed_followup_resolved_at is
  'When set, /workspace/phone/calls no longer lists this row as an unresolved missed call. Does not delete or alter status.';

create index if not exists phone_calls_workspace_missed_unresolved_idx
  on public.phone_calls (updated_at desc nulls last)
  where status = 'missed' and workspace_missed_followup_resolved_at is null;
