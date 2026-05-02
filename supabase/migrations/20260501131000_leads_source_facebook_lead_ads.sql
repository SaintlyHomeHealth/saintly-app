-- Zapier `/api/leads/facebook`: store `leads.source = 'facebook_lead_ads'` (Zapier partner webhook).

alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (
    source in (
      'phone',
      'facebook',
      'facebook_ads',
      'facebook_lead_ads',
      'google',
      'hospital',
      'other',
      'manual',
      'walk_in',
      'referral',
      'email_referral',
      'email_inquiry'
    )
  );

drop index if exists leads_facebook_auto_text_due_idx;

create index if not exists leads_facebook_auto_text_due_idx
  on public.leads (auto_text_scheduled_at asc nulls last)
  where auto_text_status = 'pending'
    and source in ('facebook', 'facebook_ads', 'facebook_lead_ads');
