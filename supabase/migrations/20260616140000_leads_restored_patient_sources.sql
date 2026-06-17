-- Allow restored patient leads moved back from recruiting pipeline.

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
      'email_inquiry',
      'sales_agent',
      'facility_outreach',
      'legacy_crm_lead',
      'restored_from_recruiting_misclassification'
    )
  );
