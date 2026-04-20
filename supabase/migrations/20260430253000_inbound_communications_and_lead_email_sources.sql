-- Inbound email intake: widen CRM lead sources + durable audit table for all email channels.

alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (
    source in (
      'phone',
      'facebook',
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

create table if not exists public.inbound_communications (
  id uuid primary key default gen_random_uuid(),
  channel_type text not null default 'email'
    check (channel_type = 'email'),
  channel_key text not null
    check (channel_key in ('referrals', 'care', 'join', 'billing')),
  provider text not null,
  external_message_id text,
  from_email text not null,
  from_name text,
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb default '[]'::jsonb,
  subject text,
  text_body text,
  html_body text,
  raw_payload jsonb,
  parsed_entities jsonb,
  related_lead_id uuid references public.leads (id) on delete set null,
  related_candidate_id uuid references public.recruiting_candidates (id) on delete set null,
  review_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inbound_communications_provider_external_msg_uidx
  on public.inbound_communications (provider, external_message_id)
  where external_message_id is not null and btrim(external_message_id) <> '';

create index if not exists inbound_communications_channel_created_idx
  on public.inbound_communications (channel_key, created_at desc);

create index if not exists inbound_communications_related_lead_idx
  on public.inbound_communications (related_lead_id)
  where related_lead_id is not null;

create index if not exists inbound_communications_related_candidate_idx
  on public.inbound_communications (related_candidate_id)
  where related_candidate_id is not null;

comment on table public.inbound_communications is
  'Inbound non-SMS communications (email webhook intake). Service-role writes from /api/inbound/email; staff read via RLS.';

create or replace function public.touch_inbound_communications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inbound_communications_updated_at on public.inbound_communications;
create trigger inbound_communications_updated_at
  before update on public.inbound_communications
  for each row
  execute function public.touch_inbound_communications_updated_at();

alter table public.inbound_communications enable row level security;

drop policy if exists "inbound_communications_select_staff" on public.inbound_communications;
create policy "inbound_communications_select_staff"
  on public.inbound_communications for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );
