-- Private Pay billing module.
-- Direct-to-patient billing for self-pay services (Respite Care, Personal Care,
-- Skilled Nursing, Physical Therapy, or custom line items). This is intentionally
-- SEPARATE from Medicare/insurance intake fields on leads/patients and from Alora.
-- Card processing is handled by Stripe; this schema stores only Stripe identifiers,
-- status, amounts, and last-4 metadata (never raw card numbers / PAN).

-- ---------------------------------------------------------------------------
-- Invoice + receipt number generators (human-friendly, gap-tolerant sequences)
-- ---------------------------------------------------------------------------
create sequence if not exists public.private_pay_invoice_number_seq;
create sequence if not exists public.private_pay_receipt_number_seq;

create or replace function public.next_private_pay_invoice_number()
returns text
language plpgsql
as $$
begin
  return 'SHH-' || to_char(now() at time zone 'America/Phoenix', 'YYYY')
    || '-' || lpad(nextval('public.private_pay_invoice_number_seq')::text, 5, '0');
end;
$$;

create or replace function public.next_private_pay_receipt_number()
returns text
language plpgsql
as $$
begin
  return 'RCP-' || to_char(now() at time zone 'America/Phoenix', 'YYYY')
    || '-' || lpad(nextval('public.private_pay_receipt_number_seq')::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Service templates (suggested rates only — admins always override per invoice)
-- ---------------------------------------------------------------------------
create table if not exists public.private_pay_service_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_type text not null default 'custom'
    check (service_type in ('respite_care', 'personal_care', 'skilled_nursing', 'physical_therapy', 'custom')),
  default_unit_label text not null default 'visit'
    check (default_unit_label in ('visit', 'hour', 'day', 'flat')),
  default_unit_amount_cents integer not null default 0 check (default_unit_amount_cents >= 0),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists private_pay_service_templates_active_idx
  on public.private_pay_service_templates (active);

comment on table public.private_pay_service_templates is
  'Suggested private-pay service rates. Rates are defaults only; the per-invoice amount is always editable.';

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table if not exists public.private_pay_invoices (
  id uuid primary key default gen_random_uuid(),
  -- Billing is anchored to the CRM person (contact). patient_id / lead_id record
  -- where the invoice was created from and are both optional.
  contact_id uuid references public.contacts (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  invoice_number text not null unique default public.next_private_pay_invoice_number(),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'void', 'refunded')),
  billing_name text,
  billing_email text,
  billing_phone text,
  billing_address text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists private_pay_invoices_contact_id_idx
  on public.private_pay_invoices (contact_id);
create index if not exists private_pay_invoices_patient_id_idx
  on public.private_pay_invoices (patient_id);
create index if not exists private_pay_invoices_lead_id_idx
  on public.private_pay_invoices (lead_id);
create index if not exists private_pay_invoices_status_idx
  on public.private_pay_invoices (status);
create index if not exists private_pay_invoices_created_at_idx
  on public.private_pay_invoices (created_at desc);
create unique index if not exists private_pay_invoices_checkout_session_uidx
  on public.private_pay_invoices (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on table public.private_pay_invoices is
  'Private-pay (self-pay) invoices billed directly to a patient/contact. Separate from Medicare/insurance and Alora.';

-- ---------------------------------------------------------------------------
-- Invoice line items (fully customizable per patient)
-- ---------------------------------------------------------------------------
create table if not exists public.private_pay_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.private_pay_invoices (id) on delete cascade,
  service_type text not null default 'custom'
    check (service_type in ('respite_care', 'personal_care', 'skilled_nursing', 'physical_therapy', 'custom')),
  description text,
  service_date date,
  quantity numeric(12, 2) not null default 1 check (quantity >= 0),
  unit_label text not null default 'visit'
    check (unit_label in ('visit', 'hour', 'day', 'flat')),
  unit_amount_cents integer not null default 0 check (unit_amount_cents >= 0),
  line_total_cents integer not null default 0 check (line_total_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists private_pay_invoice_items_invoice_id_idx
  on public.private_pay_invoice_items (invoice_id, sort_order);

comment on table public.private_pay_invoice_items is
  'Line items for a private-pay invoice. unit_label drives how the receipt reads (per visit / hour / day / flat rate).';

-- ---------------------------------------------------------------------------
-- Payments (Stripe + manual). Never stores raw card numbers.
-- ---------------------------------------------------------------------------
create table if not exists public.private_pay_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.private_pay_invoices (id) on delete cascade,
  receipt_number text unique default public.next_private_pay_receipt_number(),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  payment_method text not null default 'card'
    check (payment_method in ('card', 'cash', 'check', 'zelle', 'manual')),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  card_brand text,
  card_last4 text,
  notes text,
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists private_pay_payments_invoice_id_idx
  on public.private_pay_payments (invoice_id);
-- One succeeded payment per Stripe PaymentIntent (idempotent webhook handling).
create unique index if not exists private_pay_payments_payment_intent_uidx
  on public.private_pay_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null and status = 'succeeded';

comment on table public.private_pay_payments is
  'Payment records for private-pay invoices. Stores Stripe IDs + last4/brand only — never raw card numbers.';

-- ---------------------------------------------------------------------------
-- updated_at trigger for invoices
-- ---------------------------------------------------------------------------
create or replace function public.touch_private_pay_invoices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists private_pay_invoices_updated_at on public.private_pay_invoices;
create trigger private_pay_invoices_updated_at
  before update on public.private_pay_invoices
  for each row
  execute function public.touch_private_pay_invoices_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security — manager / admin / super_admin only (matches contacts/patients).
-- Application server code uses the service role (supabaseAdmin) after authorizing the
-- staff session, and the Stripe webhook uses the service role to mark invoices paid.
-- ---------------------------------------------------------------------------
alter table public.private_pay_service_templates enable row level security;
alter table public.private_pay_invoices enable row level security;
alter table public.private_pay_invoice_items enable row level security;
alter table public.private_pay_payments enable row level security;

do $$
declare
  t text;
  tbls text[] := array[
    'private_pay_service_templates',
    'private_pay_invoices',
    'private_pay_invoice_items',
    'private_pay_payments'
  ];
begin
  foreach t in array tbls loop
    execute format('drop policy if exists "%s_select_staff" on public.%I', t, t);
    execute format($f$
      create policy "%1$s_select_staff" on public.%1$I for select to authenticated
      using (
        exists (
          select 1 from public.staff_profiles sp
          where sp.user_id = auth.uid()
            and sp.role in ('manager', 'admin', 'super_admin')
        )
      )
    $f$, t);

    execute format('drop policy if exists "%s_insert_staff" on public.%I', t, t);
    execute format($f$
      create policy "%1$s_insert_staff" on public.%1$I for insert to authenticated
      with check (
        exists (
          select 1 from public.staff_profiles sp
          where sp.user_id = auth.uid()
            and sp.role in ('manager', 'admin', 'super_admin')
        )
      )
    $f$, t);

    execute format('drop policy if exists "%s_update_staff" on public.%I', t, t);
    execute format($f$
      create policy "%1$s_update_staff" on public.%1$I for update to authenticated
      using (
        exists (
          select 1 from public.staff_profiles sp
          where sp.user_id = auth.uid()
            and sp.role in ('manager', 'admin', 'super_admin')
        )
      )
      with check (
        exists (
          select 1 from public.staff_profiles sp
          where sp.user_id = auth.uid()
            and sp.role in ('manager', 'admin', 'super_admin')
        )
      )
    $f$, t);

    execute format('drop policy if exists "%s_delete_staff" on public.%I', t, t);
    execute format($f$
      create policy "%1$s_delete_staff" on public.%1$I for delete to authenticated
      using (
        exists (
          select 1 from public.staff_profiles sp
          where sp.user_id = auth.uid()
            and sp.role in ('manager', 'admin', 'super_admin')
        )
      )
    $f$, t);
  end loop;
end;
$$;

-- Seed suggested service templates (admins can edit amounts per invoice).
insert into public.private_pay_service_templates (name, service_type, default_unit_label, default_unit_amount_cents, active)
values
  ('Respite Care', 'respite_care', 'visit', 10000, true),
  ('Personal Care', 'personal_care', 'hour', 3500, true),
  ('Skilled Nursing', 'skilled_nursing', 'visit', 15000, true),
  ('Physical Therapy', 'physical_therapy', 'visit', 17500, true)
on conflict do nothing;
