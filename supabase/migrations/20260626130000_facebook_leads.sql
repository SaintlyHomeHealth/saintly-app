-- Facebook Lead Form intake (Zapier webhook → public.facebook_leads).

create table if not exists public.facebook_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_number text not null,
  email text,
  city text,
  who_is_care_needed_for text,
  what_type_of_help_is_needed text,
  what_coverage_do_they_have text,
  tell_us_whats_going_on text,
  form_name text,
  source text not null default 'facebook',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  raw_payload jsonb
);

create index if not exists facebook_leads_phone_number_idx
  on public.facebook_leads (phone_number);

create index if not exists facebook_leads_created_at_idx
  on public.facebook_leads (created_at desc);

comment on table public.facebook_leads is
  'Patient/care inquiry leads from Facebook Lead Ads (Zapier webhook at /api/webhooks/facebook-leads).';

comment on column public.facebook_leads.raw_payload is
  'Full JSON body from the webhook request.';

alter table public.facebook_leads enable row level security;

drop policy if exists "facebook_leads_select_staff" on public.facebook_leads;
create policy "facebook_leads_select_staff"
  on public.facebook_leads for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "facebook_leads_update_staff" on public.facebook_leads;
create policy "facebook_leads_update_staff"
  on public.facebook_leads for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );
