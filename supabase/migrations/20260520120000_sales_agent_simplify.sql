-- Sales Agent simplify: SSN, agent-side hide, internal admin chat.

-- ---------------------------------------------------------------------------
-- 1. Lead fields: SSN + sales-agent visibility hide (admin CRM keeps lead)
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists social_security_number text null;

alter table public.leads
  add column if not exists sales_agent_hidden_at timestamptz null;

alter table public.leads
  add column if not exists sales_agent_hidden_by uuid null references auth.users (id) on delete set null;

comment on column public.leads.social_security_number is
  'Patient SSN (9 digits, stored without dashes). Highly sensitive PHI — mask in UI; never log or notify.';
comment on column public.leads.sales_agent_hidden_at is
  'When set, lead is hidden from the producing sales agent Orders list only; admin CRM unchanged.';
comment on column public.leads.sales_agent_hidden_by is
  'Auth user who hid the lead from their sales agent list.';

create index if not exists leads_sales_agent_hidden_at_idx
  on public.leads (produced_by_sales_agent_id, sales_agent_hidden_at)
  where produced_by_sales_agent_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Internal staff chat: admin/manager ↔ sales agent (not SMS/email)
-- ---------------------------------------------------------------------------

create table if not exists public.sales_agent_messages (
  id uuid primary key default gen_random_uuid(),
  sales_agent_user_id uuid not null references auth.users (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  sender_role text not null,
  body text not null check (char_length(trim(body)) > 0),
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists sales_agent_messages_thread_idx
  on public.sales_agent_messages (sales_agent_user_id, created_at desc);

create index if not exists sales_agent_messages_unread_idx
  on public.sales_agent_messages (sales_agent_user_id, read_at)
  where read_at is null;

comment on table public.sales_agent_messages is
  'Internal staff chat between sales agents and admin/manager. No patient PHI by default.';

alter table public.sales_agent_messages enable row level security;

drop policy if exists "sales_agent_messages_select_agent" on public.sales_agent_messages;
create policy "sales_agent_messages_select_agent"
  on public.sales_agent_messages for select to authenticated
  using (
    public.staff_is_sales_agent()
    and sales_agent_user_id = auth.uid()
  );

drop policy if exists "sales_agent_messages_insert_agent" on public.sales_agent_messages;
create policy "sales_agent_messages_insert_agent"
  on public.sales_agent_messages for insert to authenticated
  with check (
    public.staff_is_sales_agent()
    and sales_agent_user_id = auth.uid()
    and sender_user_id = auth.uid()
    and sender_role = 'sales_agent'
  );

drop policy if exists "sales_agent_messages_select_manager" on public.sales_agent_messages;
create policy "sales_agent_messages_select_manager"
  on public.sales_agent_messages for select to authenticated
  using (public.staff_is_crm_leads_manager());

drop policy if exists "sales_agent_messages_insert_manager" on public.sales_agent_messages;
create policy "sales_agent_messages_insert_manager"
  on public.sales_agent_messages for insert to authenticated
  with check (
    public.staff_is_crm_leads_manager()
    and sender_user_id = auth.uid()
    and sender_role in ('manager', 'admin', 'super_admin')
  );

drop policy if exists "sales_agent_messages_update_read" on public.sales_agent_messages;
create policy "sales_agent_messages_update_read"
  on public.sales_agent_messages for update to authenticated
  using (
    (public.staff_is_sales_agent() and sales_agent_user_id = auth.uid())
    or public.staff_is_crm_leads_manager()
  )
  with check (
    (public.staff_is_sales_agent() and sales_agent_user_id = auth.uid())
    or public.staff_is_crm_leads_manager()
  );
