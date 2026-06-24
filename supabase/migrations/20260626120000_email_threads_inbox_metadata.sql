-- Inbox filtering metadata + normalize template subjects (em dash → hyphen).

alter table public.email_threads
  add column if not exists has_inbound boolean not null default false,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_message_direction text
    check (last_message_direction is null or last_message_direction in ('inbound', 'outbound'));

create index if not exists email_threads_inbox_idx
  on public.email_threads (mailbox_id, has_inbound, last_message_at desc nulls last)
  where has_inbound = true;

update public.email_threads t
set
  has_inbound = sub.has_inbound,
  last_inbound_at = sub.last_inbound_at,
  last_message_direction = sub.last_direction
from (
  select
    m.thread_id,
    bool_or(m.direction = 'inbound') as has_inbound,
    max(case when m.direction = 'inbound' then coalesce(m.gmail_internal_date, m.created_at) end) as last_inbound_at,
    (array_agg(m.direction order by coalesce(m.gmail_internal_date, m.created_at) desc))[1] as last_direction
  from public.email_messages m
  group by m.thread_id
) sub
where sub.thread_id = t.id;

update public.email_marketing_templates
set subject = replace(replace(subject, ' — ', ' - '), '—', ' - ')
where subject like '%—%';
