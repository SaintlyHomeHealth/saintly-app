-- Recruiting list performance: source filter index (status, created_at, license_status, phone/email already indexed).

create index if not exists facebook_recruiting_leads_source_idx
  on public.facebook_recruiting_leads (source);

create index if not exists facebook_recruiting_leads_form_name_idx
  on public.facebook_recruiting_leads (form_name)
  where form_name is not null;

comment on index public.facebook_recruiting_leads_source_idx is
  'Supports recruiting workspace source/tab filters and stats counts.';
