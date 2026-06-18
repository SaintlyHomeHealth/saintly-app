-- Normalize recruiting lead source values for unified workspace tabs (non-destructive).
-- Maps legacy display strings to canonical source keys used by admin filters.

update public.facebook_recruiting_leads
set source = 'facebook'
where source is not null
  and lower(trim(source)) in (
    'facebook lead form',
    'facebook_lead_ads',
    'facebook lead ads',
    'meta lead'
  )
  and source <> 'facebook';

update public.facebook_recruiting_leads
set source = 'website_form'
where source is not null
  and lower(trim(source)) in ('website', 'website careers', 'careers_form', 'careers form')
  and source not in ('website_form', 'careers_form');

update public.facebook_recruiting_leads
set source = 'manual_resume_upload'
where source is not null
  and (
    lower(trim(source)) like '%manual resume%'
    or lower(trim(form_name)) like '%manual resume%'
  )
  and source <> 'manual_resume_upload';

-- Mark likely duplicate resume-bridge leads that share email with an existing manual upload lead.
-- Does not delete rows; adds metadata for admin review.
update public.facebook_recruiting_leads as dup
set raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object(
  'dedupe_review',
  jsonb_build_object(
    'flagged_at', now(),
    'reason', 'possible_duplicate_email',
    'canonical_lead_id', canon.id
  )
)
from public.facebook_recruiting_leads as canon
where dup.id <> canon.id
  and dup.normalized_email is not null
  and dup.normalized_email = canon.normalized_email
  and dup.source = 'manual_resume_upload'
  and canon.source = 'manual_resume_upload'
  and dup.created_at > canon.created_at
  and (dup.raw_payload->'dedupe_review') is null;
