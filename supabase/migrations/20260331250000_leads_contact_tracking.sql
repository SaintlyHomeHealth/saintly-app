-- CRM lead contact attempt / outcome tracking (intake workflow).

alter table public.leads
  add column if not exists last_contact_at timestamptz,
  add column if not exists last_contact_type text,
  add column if not exists last_outcome text,
  add column if not exists last_note text;

comment on column public.leads.last_contact_at is 'When the last logged contact attempt was recorded.';
comment on column public.leads.last_contact_type is 'Channel of last attempt: call or text.';
comment on column public.leads.last_outcome is 'Result of last contact attempt (app-enforced enum).';
comment on column public.leads.last_note is 'Free-text note from last contact log.';

alter table public.leads
  drop constraint if exists leads_last_contact_type_check;

alter table public.leads
  add constraint leads_last_contact_type_check
  check (last_contact_type is null or last_contact_type in ('call', 'text'));

alter table public.leads
  drop constraint if exists leads_last_outcome_check;

alter table public.leads
  add constraint leads_last_outcome_check
  check (
    last_outcome is null
    or last_outcome in ('spoke', 'left_voicemail', 'no_answer', 'wrong_number', 'not_interested')
  );
