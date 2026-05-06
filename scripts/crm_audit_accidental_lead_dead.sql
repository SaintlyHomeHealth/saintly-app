-- Audit leads marked dead via CRM (possible accidental implicit form submit / Enter key bug).
-- Run in Supabase SQL editor or psql with service role; adjust the time window as needed.
--
-- Manual regression checklist (Insurance / Coverage tab):
-- 1. Open an active (non-dead) patient-care lead.
-- 2. Scroll to Insurance → payer selection combobox.
-- 3. Type a payer name that is not in the list.
-- 4. Click "+ Add …" (and separately retry with Enter in the combobox).
-- 5. Confirm: no full-page reload, URL unchanged, hash/tab unchanged, lead still active,
--    insurance section still visible, new payer selected.
-- 6. Click "Save intake", refresh, confirm payer persists.
--
-- Restore (manual): review rows below with stakeholders; revert status from audit trail /
-- prior backups — there is no automatic undo here.

with marked as (
  select
    la.lead_id,
    max(la.created_at) as last_marked_dead_at
  from public.lead_activities la
  where la.deleted_at is null
    and la.event_type = 'marked_dead'
  group by la.lead_id
)
select
  l.id as lead_id,
  l.contact_id,
  l.status,
  l.lead_quality,
  l.crm_stage,
  l.updated_at as lead_updated_at,
  m.last_marked_dead_at,
  (
    select la.body
    from public.lead_activities la
    where la.lead_id = l.id
      and la.deleted_at is null
      and la.event_type = 'marked_dead'
      and la.created_at = m.last_marked_dead_at
    limit 1
  ) as marked_dead_activity_body,
  (
    select la.metadata
    from public.lead_activities la
    where la.lead_id = l.id
      and la.deleted_at is null
      and la.event_type = 'marked_dead'
      and la.created_at = m.last_marked_dead_at
    limit 1
  ) as marked_dead_activity_metadata
from public.leads l
join marked m on m.lead_id = l.id
where l.deleted_at is null
  and lower(trim(coalesce(l.status, ''))) = 'dead_lead'
  -- Last 48 hours (UTC); tighten to your incident window.
  and m.last_marked_dead_at >= (now() at time zone 'utc') - interval '48 hours'
order by m.last_marked_dead_at desc;
