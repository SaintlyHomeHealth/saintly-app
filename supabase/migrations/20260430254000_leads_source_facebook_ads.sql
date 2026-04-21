-- Partner API: `/api/leads/facebook` stores `leads.source = 'facebook_ads'` (distinct from Meta Lead Ads `facebook`).

alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (
    source in (
      'phone',
      'facebook',
      'facebook_ads',
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
