-- Soft-hide rows from workspace Dispatch call log without deleting history.

alter table public.phone_calls
  add column if not exists dispatch_hidden_at timestamptz,
  add column if not exists dispatch_hidden_by_user_id uuid references auth.users (id) on delete set null;

comment on column public.phone_calls.dispatch_hidden_at is
  'When set, row is omitted from /workspace/phone/calls (Dispatch call log). Does not delete Twilio history.';
comment on column public.phone_calls.dispatch_hidden_by_user_id is
  'Staff user who hid the row from Dispatch (admin action).';

create index if not exists phone_calls_dispatch_visible_updated_idx
  on public.phone_calls (updated_at desc)
  where dispatch_hidden_at is null;
