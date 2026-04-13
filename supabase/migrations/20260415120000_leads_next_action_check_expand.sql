-- Expand leads_next_action_check to match LEAD_NEXT_ACTION_OPTIONS in
-- src/lib/crm/lead-follow-up-options.ts (keep in sync).

alter table public.leads
  drop constraint if exists leads_next_action_check;

alter table public.leads
  add constraint leads_next_action_check
  check (
    next_action is null
    or next_action in (
      'call_again',
      'text_follow_up',
      'schedule_soc',
      'verify_insurance',
      'get_doctor_info',
      'convert_to_patient',
      'no_further_action',
      'call_patient',
      'call_referral',
      'waiting_docs',
      'other'
    )
  );
