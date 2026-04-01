-- Voicemail metadata on phone_calls (Twilio recording callback).

alter table public.phone_calls add column if not exists voicemail_recording_sid text;
alter table public.phone_calls add column if not exists voicemail_recording_url text;
alter table public.phone_calls add column if not exists voicemail_duration_seconds integer;
alter table public.phone_calls add column if not exists voicemail_received_at timestamptz;
alter table public.phone_calls add column if not exists voicemail_status text;
alter table public.phone_calls add column if not exists voicemail_from text;
alter table public.phone_calls add column if not exists voicemail_to text;
