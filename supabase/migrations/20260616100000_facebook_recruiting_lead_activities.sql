-- Recruiting lead timeline (template emails, notes, status changes).

create table if not exists public.facebook_recruiting_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.facebook_recruiting_leads (id) on delete cascade,
  event_type text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists facebook_recruiting_lead_activities_lead_created_idx
  on public.facebook_recruiting_lead_activities (lead_id, created_at asc);

comment on table public.facebook_recruiting_lead_activities is
  'Recruiting lead timeline: outbound template emails, manual notes, and system events.';

alter table public.facebook_recruiting_lead_activities enable row level security;

drop policy if exists "facebook_recruiting_lead_activities_select_staff" on public.facebook_recruiting_lead_activities;
create policy "facebook_recruiting_lead_activities_select_staff"
  on public.facebook_recruiting_lead_activities for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "facebook_recruiting_lead_activities_insert_staff" on public.facebook_recruiting_lead_activities;
create policy "facebook_recruiting_lead_activities_insert_staff"
  on public.facebook_recruiting_lead_activities for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );
