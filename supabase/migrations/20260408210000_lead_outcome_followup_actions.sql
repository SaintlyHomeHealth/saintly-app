-- CRM: richer contact outcomes, follow-up time, attempted actions snapshot.

alter table public.leads
  add column if not exists follow_up_at timestamptz;

alter table public.leads
  add column if not exists contact_attempt_actions jsonb;

comment on column public.leads.follow_up_at is 'Next follow-up moment (Central ops); complements follow_up_date.';
comment on column public.leads.contact_attempt_actions is 'Last saved attempted-action keys from contact outcome form (e.g. called, sent_text).';

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
      'wrong_number',
      'not_interested',
      'text_sent',
      'spoke_scheduled'
    )
  );

create index if not exists leads_follow_up_at_idx
  on public.leads (follow_up_at)
  where follow_up_at is not null;
