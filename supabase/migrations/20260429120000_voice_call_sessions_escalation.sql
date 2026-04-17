-- Escalation + missed-call protection fields for voice_call_sessions (mobile + ops reporting).

alter table public.voice_call_sessions
  add column if not exists escalation_level integer not null default 1,
  add column if not exists forwarded_to_number text,
  add column if not exists voicemail_url text,
  add column if not exists voicemail_duration_seconds integer,
  add column if not exists missed boolean not null default false,
  add column if not exists callback_attempt_count integer not null default 0;

alter table public.voice_call_sessions
  drop constraint if exists voice_call_sessions_escalation_level_check;

alter table public.voice_call_sessions
  add constraint voice_call_sessions_escalation_level_check check (
    escalation_level >= 1 and escalation_level <= 9
  );

create index if not exists voice_call_sessions_missed_idx
  on public.voice_call_sessions (missed)
  where missed = true;
