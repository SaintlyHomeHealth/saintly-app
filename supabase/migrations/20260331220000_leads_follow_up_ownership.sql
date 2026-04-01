-- Lead follow-up tracking and ownership (CRM pipeline).

alter table public.leads
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null,
  add column if not exists next_action text,
  add column if not exists follow_up_date date;

comment on column public.leads.owner_user_id is 'Assigned staff (auth.users id; matches staff_profiles.user_id).';
comment on column public.leads.next_action is 'Next CRM task for this lead (enum enforced in app; optional DB check).';
comment on column public.leads.follow_up_date is 'Calendar date when the lead should be followed up.';

alter table public.leads
  drop constraint if exists leads_next_action_check;

alter table public.leads
  add constraint leads_next_action_check
  check (
    next_action is null
    or next_action in (
      'call_patient',
      'call_referral',
      'verify_insurance',
      'waiting_docs',
      'schedule_soc',
      'other'
    )
  );

create index if not exists leads_follow_up_date_idx on public.leads (follow_up_date)
  where follow_up_date is not null;

create index if not exists leads_owner_user_id_idx on public.leads (owner_user_id)
  where owner_user_id is not null;
