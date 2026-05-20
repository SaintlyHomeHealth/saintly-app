-- Dispatch call log cleanup — RUN SELECT FIRST, then optional UPDATE.
-- Target: polluted PSTN-bridge / staff-cell rows (+19167963306), May 2026 test outbound.
-- Does NOT delete rows; sets dispatch_hidden_at (soft-hide from /workspace/phone/calls).

-- ─── 1) Preview: rows that will be hidden ───────────────────────────────────
select
  id,
  created_at,
  updated_at,
  direction,
  status,
  from_e164,
  to_e164,
  external_call_id,
  dispatch_hidden_at,
  metadata->>'source' as metadata_source,
  metadata->>'phase' as metadata_phase,
  contact_id,
  assigned_to_user_id,
  owner_user_id
from public.phone_calls
where dispatch_hidden_at is null
  and (
    -- PSTN bridge staff-leg rows (internal bridge; patient is not the list party)
    (metadata->>'source') = 'outbound_pstn_bridge'
    or (
      -- Outbound rows where the displayed party was staff cell (916) 796-3306
      direction = 'outbound'
      and created_at >= '2026-05-19'::timestamptz
      and created_at < '2026-05-22'::timestamptz
      and regexp_replace(coalesce(to_e164, ''), '\D', '', 'g') in ('19167963306', '9167963306')
    )
  )
order by created_at desc;

-- ─── 2) Optional: include Test Patient contact name in preview ─────────────
select
  pc.id,
  pc.created_at,
  pc.direction,
  pc.from_e164,
  pc.to_e164,
  pc.status,
  c.full_name as contact_name
from public.phone_calls pc
left join public.contacts c on c.id = pc.contact_id
where pc.dispatch_hidden_at is null
  and pc.created_at >= '2026-05-19'::timestamptz
  and pc.created_at < '2026-05-22'::timestamptz
  and (
    (pc.metadata->>'source') = 'outbound_pstn_bridge'
    or (
      pc.direction = 'outbound'
      and regexp_replace(coalesce(pc.to_e164, ''), '\D', '', 'g') in ('19167963306', '9167963306')
    )
  )
order by pc.created_at desc;

-- ─── 3) Count only ───────────────────────────────────────────────────────────
select count(*) as rows_to_hide
from public.phone_calls
where dispatch_hidden_at is null
  and (
    (metadata->>'source') = 'outbound_pstn_bridge'
    or (
      direction = 'outbound'
      and created_at >= '2026-05-19'::timestamptz
      and created_at < '2026-05-22'::timestamptz
      and regexp_replace(coalesce(to_e164, ''), '\D', '', 'g') in ('19167963306', '9167963306')
    )
  );

-- ─── 4) APPLY (uncomment after reviewing SELECT results) ─────────────────────
-- update public.phone_calls
-- set
--   dispatch_hidden_at = now(),
--   dispatch_hidden_by_user_id = null
-- where dispatch_hidden_at is null
--   and (
--     (metadata->>'source') = 'outbound_pstn_bridge'
--     or (
--       direction = 'outbound'
--       and created_at >= '2026-05-19'::timestamptz
--       and created_at < '2026-05-22'::timestamptz
--       and regexp_replace(coalesce(to_e164, ''), '\D', '', 'g') in ('19167963306', '9167963306')
--     )
--   );

-- ─── 5) Verify nothing hidden that is a real inbound lead (example 720) ─────
-- select id, created_at, direction, from_e164, to_e164, status
-- from public.phone_calls
-- where dispatch_hidden_at is not null
--   and direction = 'inbound'
--   and regexp_replace(coalesce(from_e164, ''), '\D', '', 'g') like '%720%'
-- order by created_at desc;
