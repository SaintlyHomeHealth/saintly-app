-- AI classification follow-up tasks: one open follow-up per call (idempotent insert).

create unique index if not exists phone_call_tasks_voice_ai_followup_one_per_call_uidx
  on public.phone_call_tasks (phone_call_id)
  where source = 'voice_ai_followup';
