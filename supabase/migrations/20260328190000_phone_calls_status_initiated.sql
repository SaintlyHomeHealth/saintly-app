-- Allow Twilio inbound "initiated" state on phone_calls.

alter table public.phone_calls drop constraint if exists phone_calls_status_check;

alter table public.phone_calls add constraint phone_calls_status_check check (
  status in (
    'unknown',
    'initiated',
    'ringing',
    'in_progress',
    'completed',
    'missed',
    'voicemail',
    'failed',
    'cancelled'
  )
);
