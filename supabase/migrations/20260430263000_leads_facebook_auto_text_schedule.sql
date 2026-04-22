-- Deferred Facebook intro SMS (America/Phoenix business hours); see `facebook-lead-intro-sms.ts` + `/api/cron/facebook-auto-text`.

alter table public.leads
  add column if not exists auto_text_status text,
  add column if not exists auto_text_scheduled_at timestamptz,
  add column if not exists auto_text_sent_at timestamptz;

alter table public.leads
  drop constraint if exists leads_auto_text_status_check;

alter table public.leads
  add constraint leads_auto_text_status_check
  check (
    auto_text_status is null
    or auto_text_status in ('pending', 'sending', 'sent', 'skipped', 'failed')
  );

comment on column public.leads.auto_text_status is
  'Facebook lead automated intro SMS: pending (queued), sending (in flight), sent, skipped (no send), failed (send error).';
comment on column public.leads.auto_text_scheduled_at is
  'When queued outbound SMS may first be sent (next 8:00 America/Phoenix if received after hours).';
comment on column public.leads.auto_text_sent_at is
  'When automated intro SMS was accepted by Twilio (outbound succeeded).';

create index if not exists leads_facebook_auto_text_due_idx
  on public.leads (auto_text_scheduled_at asc nulls last)
  where auto_text_status = 'pending'
    and source in ('facebook', 'facebook_ads');

-- Backfill from legacy intro SMS columns where present.
update public.leads
set
  auto_text_status = case initial_sms_status
    when 'pending' then 'pending'
    when 'sent' then 'sent'
    when 'skipped' then 'skipped'
    when 'failed' then 'failed'
    else auto_text_status
  end,
  auto_text_sent_at = coalesce(auto_text_sent_at, initial_sms_sent_at)
where initial_sms_status is not null
  and auto_text_status is null;

-- Legacy rows stuck in pending without a schedule: allow the cron worker to pick them up once.
update public.leads
set auto_text_scheduled_at = coalesce(auto_text_scheduled_at, now())
where auto_text_status = 'pending'
  and auto_text_scheduled_at is null
  and source in ('facebook', 'facebook_ads');
