-- Audit: last time an invoice moved from submitted back to draft (nurse reopen or admin return).

alter table public.nurse_weekly_billings
  add column if not exists returned_to_draft_at timestamptz;

comment on column public.nurse_weekly_billings.returned_to_draft_at is
  'Set when status goes from submitted to draft (reopen / return to draft). submitted_at is cleared until resubmit.';
