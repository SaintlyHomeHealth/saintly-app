-- Allow "unclassified" for missed-call/system SMS threads.
-- Missed calls create outbound system SMS conversations; those should not be treated as leads.

alter table public.conversations
  drop constraint if exists conversations_lead_status_check;

alter table public.conversations
  add constraint conversations_lead_status_check
  check (lead_status in ('new_lead', 'contacted', 'scheduled', 'admitted', 'not_qualified', 'unclassified'));

