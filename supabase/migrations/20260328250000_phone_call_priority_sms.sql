-- Phase-1 priority SMS metadata on phone_calls (admin + realtime).

alter table public.phone_calls
  add column if not exists priority_sms_sent_at timestamptz,
  add column if not exists priority_sms_reason text;

create index if not exists phone_calls_priority_sms_sent_idx
  on public.phone_calls (priority_sms_sent_at desc nulls last)
  where priority_sms_sent_at is not null;
