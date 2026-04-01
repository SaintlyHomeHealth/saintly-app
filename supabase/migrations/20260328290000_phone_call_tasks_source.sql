-- Auto-generated missed-call callback tasks: dedupe by source.

alter table public.phone_call_tasks
  add column if not exists source text;

create unique index if not exists phone_call_tasks_auto_missed_one_per_call_uidx
  on public.phone_call_tasks (phone_call_id)
  where source = 'auto_missed_call';
