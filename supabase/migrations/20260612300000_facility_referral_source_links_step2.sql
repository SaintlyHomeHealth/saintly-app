-- Phase 24 Step 2: Campaign/rep tokens + short slugs for /refer/t/[token]

alter table public.facility_referral_source_links
  add column if not exists short_slug text,
  add column if not exists material_type text,
  add column if not exists default_source text;

create unique index if not exists facility_referral_source_links_short_slug_uidx
  on public.facility_referral_source_links (short_slug)
  where short_slug is not null and short_slug <> '';

create index if not exists facility_referral_source_links_campaign_id_idx
  on public.facility_referral_source_links (campaign_id)
  where campaign_id is not null;

create index if not exists facility_referral_source_links_sales_rep_id_idx
  on public.facility_referral_source_links (sales_rep_id)
  where sales_rep_id is not null;

create index if not exists facility_referral_source_links_token_idx
  on public.facility_referral_source_links (token)
  where token is not null;
