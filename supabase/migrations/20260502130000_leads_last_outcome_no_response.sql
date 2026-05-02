-- Allow manual multi-attempt contact status "No response" on `leads.last_outcome`.

alter table public.leads
  drop constraint if exists leads_last_outcome_check;

alter table public.leads
  add constraint leads_last_outcome_check
  check (
    last_outcome is null
    or last_outcome in (
      'spoke',
      'left_voicemail',
      'no_answer',
      'no_response',
      'wrong_number',
      'not_interested',
      'text_sent',
      'spoke_scheduled'
    )
  );

comment on column public.leads.last_outcome is 'Logged contact result; `no_response` is a manual multi-attempt triage status (never auto-inferred).';
