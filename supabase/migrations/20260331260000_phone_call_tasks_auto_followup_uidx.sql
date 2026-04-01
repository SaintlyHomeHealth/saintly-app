-- One auto-follow-up task per call (SMS + callback pipeline).

create unique index if not exists phone_call_tasks_auto_followup_one_per_call_uidx
  on public.phone_call_tasks (phone_call_id)
  where source = 'auto_followup';
