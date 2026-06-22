-- Restore actual call event times on phone_calls after disposition/backfill writes bumped updated_at.
-- Keeps phone_calls as canonical; does not rewrite created_at.

-- Earliest append-only event ≈ when the call started.
update public.phone_calls pc
set started_at = ev.earliest_at
from (
  select call_id, min(created_at) as earliest_at
  from public.phone_call_events
  group by call_id
) ev
where pc.id = ev.call_id
  and pc.started_at is null;

-- Rows whose started_at was set during a recent write (often migration/backfill time), not the real call.
update public.phone_calls pc
set started_at = ev.earliest_at
from (
  select call_id, min(created_at) as earliest_at
  from public.phone_call_events
  group by call_id
) ev
where pc.id = ev.call_id
  and ev.earliest_at < pc.updated_at - interval '1 hour'
  and (
    pc.started_at is null
    or pc.started_at >= pc.updated_at - interval '30 minutes'
  );

-- Terminal time from latest event when ended_at was never persisted.
update public.phone_calls pc
set ended_at = ev.latest_at
from (
  select call_id, max(created_at) as latest_at
  from public.phone_call_events
  group by call_id
) ev
where pc.id = ev.call_id
  and pc.ended_at is null;

-- Voicemail receipt time from events when still missing on the call row.
update public.phone_calls pc
set voicemail_received_at = coalesce(pc.voicemail_received_at, ev.event_at)
from (
  select distinct on (call_id)
    call_id,
    created_at as event_at
  from public.phone_call_events
  where event_type = 'twilio.voicemail_recording'
    and nullif(trim(both from payload ->> 'recording_sid'), '') is not null
  order by call_id, created_at desc
) ev
where pc.id = ev.call_id
  and pc.voicemail_received_at is null;

create index if not exists phone_calls_missed_started_at_idx
  on public.phone_calls (started_at desc nulls last)
  where missed = true or status in ('missed', 'voicemail');
