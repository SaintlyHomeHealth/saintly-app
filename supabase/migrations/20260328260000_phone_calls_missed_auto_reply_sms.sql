-- Outbound missed-call auto-reply to the caller (Twilio SMS).

alter table public.phone_calls
  add column if not exists auto_reply_sms_sent_at timestamptz,
  add column if not exists auto_reply_sms_body text;

create index if not exists phone_calls_auto_reply_sms_sent_idx
  on public.phone_calls (auto_reply_sms_sent_at desc nulls last)
  where auto_reply_sms_sent_at is not null;
