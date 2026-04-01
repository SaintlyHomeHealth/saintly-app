-- Phase 4: Follow-up / next action tracking for SMS conversations.

alter table public.conversations
  add column if not exists next_action text;

alter table public.conversations
  add column if not exists follow_up_due_at timestamptz;

alter table public.conversations
  add column if not exists follow_up_completed_at timestamptz;

