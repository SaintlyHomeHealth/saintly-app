-- Optional SMS delivery diagnostics (10DLC / config); follow-up rows remain source of truth.

alter table public.phone_call_notifications
  add column if not exists last_sms_attempt_at timestamptz,
  add column if not exists last_sms_error text;
