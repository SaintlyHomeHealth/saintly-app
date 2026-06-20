-- Canonical missed/voicemail disposition on phone_calls + backfill from existing artifacts.

alter table public.phone_calls add column if not exists has_voicemail boolean not null default false;
alter table public.phone_calls add column if not exists answered boolean;
alter table public.phone_calls add column if not exists missed boolean;

comment on column public.phone_calls.has_voicemail is 'True when a Saintly/Twilio voicemail recording is attached.';
comment on column public.phone_calls.answered is 'Null until terminal; false for missed/voicemail inbound.';
comment on column public.phone_calls.missed is 'Null until terminal; true for unanswered inbound including voicemail.';

create unique index if not exists phone_calls_voicemail_recording_sid_unique_idx
  on public.phone_calls (voicemail_recording_sid)
  where voicemail_recording_sid is not null;

-- Restore recording metadata from append-only events when the row lost voicemail_* columns.
update public.phone_calls pc
set
  voicemail_recording_sid = coalesce(pc.voicemail_recording_sid, ev.recording_sid),
  voicemail_recording_url = coalesce(
    pc.voicemail_recording_url,
    nullif(trim(both from ev.payload ->> 'recording_url'), '')
  ),
  voicemail_duration_seconds = coalesce(
    pc.voicemail_duration_seconds,
    nullif(ev.payload ->> 'recording_duration_seconds', '')::integer
  ),
  voicemail_received_at = coalesce(pc.voicemail_received_at, ev.created_at)
from (
  select distinct on (call_id)
    call_id,
    payload ->> 'recording_sid' as recording_sid,
    payload,
    created_at
  from public.phone_call_events
  where event_type = 'twilio.voicemail_recording'
    and nullif(trim(both from payload ->> 'recording_sid'), '') is not null
  order by call_id, created_at desc
) ev
where pc.id = ev.call_id
  and pc.voicemail_recording_sid is null;

-- Thread voicemails without recording sid on the call row still count as voicemail.
update public.phone_calls pc
set has_voicemail = true
from public.messages m
where m.phone_call_id = pc.id
  and m.message_type = 'voicemail'
  and m.deleted_at is null
  and pc.has_voicemail is distinct from true;

-- Normalize disposition for every row with a recording artifact.
update public.phone_calls
set
  has_voicemail = true,
  answered = false,
  missed = true,
  status = case
    when status in ('completed', 'in_progress', 'ringing', 'initiated', 'unknown') then 'voicemail'
    else status
  end
where voicemail_recording_sid is not null
   or has_voicemail = true;

-- Completed inbound rows that were misclassified before voicemail_recording_sid landed.
update public.phone_calls
set
  has_voicemail = true,
  answered = false,
  missed = true,
  status = 'voicemail'
where direction = 'inbound'
  and status = 'completed'
  and voicemail_recording_sid is not null;

create index if not exists phone_calls_has_voicemail_started_at_idx
  on public.phone_calls (started_at desc nulls last)
  where has_voicemail = true;

create index if not exists phone_calls_missed_updated_at_idx
  on public.phone_calls (updated_at desc)
  where missed = true or status in ('missed', 'voicemail');
