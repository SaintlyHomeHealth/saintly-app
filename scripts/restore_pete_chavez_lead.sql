-- One-time admin safety script: restore Pete Chavez to active CRM pipeline.
-- Lead: Pete Chavez — id 2c0fc4d3-1463-4044-8aef-e76f4687a55d (Facebook Lead Ads).
--
-- Run in Supabase SQL Editor (or psql) with privileges that can UPDATE public.leads
-- and INSERT into public.lead_activities.
--
-- Idempotent safety:
-- - UPDATE only runs when status is dead_lead and deleted_at is null.
-- - Activity row is inserted only when the UPDATE returns a row (no duplicate logs on re-run).
--
-- What this does NOT touch: notes, contacts, conversations, messages, attachments,
-- payer/Medicare fields, or other lead columns (only `status` changes).

-- ---------------------------------------------------------------------------
-- 1) Inspect current row + contact (run first; re-run after restore to verify)
-- ---------------------------------------------------------------------------
select
  l.id,
  l.contact_id,
  l.status,
  l.deleted_at,
  l.crm_stage,
  l.lead_quality,
  l.source,
  l.created_at,
  l.updated_at,
  c.first_name,
  c.last_name,
  c.full_name,
  c.primary_phone,
  c.email
from public.leads l
join public.contacts c on c.id = l.contact_id
where l.id = '2c0fc4d3-1463-4044-8aef-e76f4687a55d';

-- Recent terminal / status activities for audit context
select id, event_type, body, metadata, created_at
from public.lead_activities
where lead_id = '2c0fc4d3-1463-4044-8aef-e76f4687a55d'
  and deleted_at is null
  and event_type in ('marked_dead', 'status_changed')
order by created_at desc
limit 10;

-- ---------------------------------------------------------------------------
-- 2) Restore: pipeline status from latest marked_dead metadata.before, else 'new'
-- ---------------------------------------------------------------------------
begin;

drop table if exists restore_result;

create temporary table restore_result (
  id uuid primary key,
  previous_status text not null,
  new_status text not null
);

with prev as (
  select
    la.metadata ->> 'before' as before_status
  from public.lead_activities la
  where la.lead_id = '2c0fc4d3-1463-4044-8aef-e76f4687a55d'
    and la.deleted_at is null
    and la.event_type = 'marked_dead'
  order by la.created_at desc
  limit 1
),
chosen as (
  select case
    when trim(coalesce((select before_status from prev), '')) in (
      'new',
      'new_lead',
      'new_applicant',
      'attempted_contact',
      'spoke',
      'intake_in_progress',
      'waiting_on_documents',
      'verify_insurance',
      'waiting_on_referral',
      'ready_to_convert',
      'admitted'
    ) then trim((select before_status from prev))
    else 'new'
  end as new_status
),
upd as (
  update public.leads l
  set status = (select new_status from chosen)
  where l.id = '2c0fc4d3-1463-4044-8aef-e76f4687a55d'
    and l.deleted_at is null
    and lower(trim(coalesce(l.status, ''))) = 'dead_lead'
  returning l.id, l.status
)
insert into restore_result (id, previous_status, new_status)
select upd.id, 'dead_lead', upd.status
from upd;

insert into public.lead_activities (
  lead_id,
  event_type,
  body,
  metadata,
  created_by_user_id,
  deletable
)
select
  r.id,
  'status_changed',
  'Lead restored to active pipeline after accidental mark-dead',
  jsonb_build_object(
    'reason', 'Restored after accidental implicit submit / mark-dead bug',
    'restored_by_admin', true,
    'previous_status', r.previous_status,
    'new_status', r.new_status
  ),
  null,
  false
from restore_result r;

commit;

-- ---------------------------------------------------------------------------
-- 3) Return restored row
-- ---------------------------------------------------------------------------
select
  l.id,
  l.status,
  l.deleted_at,
  l.crm_stage,
  l.lead_quality,
  l.updated_at,
  c.full_name,
  c.primary_phone,
  c.email
from public.leads l
join public.contacts c on c.id = l.contact_id
where l.id = '2c0fc4d3-1463-4044-8aef-e76f4687a55d';
