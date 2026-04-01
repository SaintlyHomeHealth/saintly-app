-- Short inbound hangups (Twilio "completed" with very low duration, no voicemail artifact).

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
    'abandoned',
    'failed',
    'cancelled'
  )
);
