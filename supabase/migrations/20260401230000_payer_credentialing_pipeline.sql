-- Pipeline execution: next action, due date, priority + latest-activity view for list previews.

alter table public.payer_credentialing_records
  add column if not exists next_action text;

alter table public.payer_credentialing_records
  add column if not exists next_action_due_date date;

alter table public.payer_credentialing_records
  add column if not exists priority text not null default 'medium';

alter table public.payer_credentialing_records
  drop constraint if exists payer_credentialing_records_priority_check;

alter table public.payer_credentialing_records
  add constraint payer_credentialing_records_priority_check
  check (priority in ('high', 'medium', 'low'));

create index if not exists payer_credentialing_records_priority_idx
  on public.payer_credentialing_records (priority);

create index if not exists payer_credentialing_records_next_due_idx
  on public.payer_credentialing_records (next_action_due_date)
  where next_action_due_date is not null;

comment on column public.payer_credentialing_records.next_action is
  'Operational next step (e.g. follow up with payer).';
comment on column public.payer_credentialing_records.next_action_due_date is
  'When the next action should happen.';
comment on column public.payer_credentialing_records.priority is
  'Business priority: high / medium / low.';

-- One row per payer: most recent timeline entry (for command-center list preview).
create or replace view public.payer_credentialing_latest_activity as
select distinct on (a.credentialing_record_id)
  a.credentialing_record_id,
  a.summary,
  a.created_at
from public.payer_credentialing_activity a
order by a.credentialing_record_id, a.created_at desc;

comment on view public.payer_credentialing_latest_activity is
  'Latest activity summary per payer credentialing record (for admin list).';

grant select on public.payer_credentialing_latest_activity to authenticated;

-- Seed high priority for key Arizona payers (ops default).
update public.payer_credentialing_records p
set priority = 'high'
where
  p.market_state = 'AZ'
  and (
    lower(trim(p.payer_name)) = lower(trim('AHCCCS'))
    or lower(trim(p.payer_name)) = lower(trim('Mercy Care'))
    or lower(trim(p.payer_name)) = lower(trim('Banner – University Family Care'))
    or lower(trim(p.payer_name)) = lower(trim('UnitedHealthcare'))
    or lower(trim(p.payer_name)) = lower(trim('Blue Cross Blue Shield of Arizona'))
  );
