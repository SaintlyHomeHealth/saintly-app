-- Phase 3 SMS inbox: lightweight lead status tracking on conversations.

alter table public.conversations
  add column if not exists lead_status text not null default 'new_lead';

alter table public.conversations
  drop constraint if exists conversations_lead_status_check;

alter table public.conversations
  add constraint conversations_lead_status_check
  check (lead_status in ('new_lead', 'contacted', 'scheduled', 'admitted', 'not_qualified'));

