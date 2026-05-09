-- CRM leads list: track manual call attempts without changing pipeline / outcome columns.
alter table public.leads
  add column if not exists call_attempt_count integer not null default 0;

comment on column public.leads.call_attempt_count is
  'Non-negative tally for outbound call attempts from CRM list; history in lead_activities.';
