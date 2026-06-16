-- Private Pay: saved cards on file (Stripe Customer + PaymentMethod metadata only).
-- Never stores raw card numbers, CVV, or full PAN.

-- ---------------------------------------------------------------------------
-- Billing customers (one row per CRM contact with private-pay billing)
-- ---------------------------------------------------------------------------
create table if not exists public.private_pay_customers (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_pay_customers_contact_uidx unique (contact_id)
);

create index if not exists private_pay_customers_stripe_customer_id_idx
  on public.private_pay_customers (stripe_customer_id)
  where stripe_customer_id is not null;

comment on table public.private_pay_customers is
  'Private-pay billing profile per CRM contact. Stores Stripe customer ID only — never card numbers.';

-- ---------------------------------------------------------------------------
-- Saved payment methods (display metadata + Stripe PaymentMethod ID)
-- ---------------------------------------------------------------------------
create table if not exists public.private_pay_payment_methods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.private_pay_customers (id) on delete cascade,
  stripe_payment_method_id text not null,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean not null default false,
  consent_collected_at timestamptz,
  created_at timestamptz not null default now(),
  constraint private_pay_payment_methods_stripe_pm_uidx unique (stripe_payment_method_id)
);

create index if not exists private_pay_payment_methods_customer_id_idx
  on public.private_pay_payment_methods (customer_id, created_at desc);

comment on table public.private_pay_payment_methods is
  'Saved cards for off-session private-pay charges. Brand, last4, and expiration only — Stripe stores the card.';

-- ---------------------------------------------------------------------------
-- Extend payment records for off-session card charges
-- ---------------------------------------------------------------------------
alter table public.private_pay_payments
  add column if not exists customer_id uuid references public.private_pay_customers (id) on delete set null;

alter table public.private_pay_payments
  add column if not exists stripe_payment_method_id text;

alter table public.private_pay_payments
  add column if not exists failure_message text;

comment on column public.private_pay_payments.customer_id is
  'Private-pay customer profile when charging a saved card.';
comment on column public.private_pay_payments.stripe_payment_method_id is
  'Stripe PaymentMethod used for this charge (saved card metadata lives in private_pay_payment_methods).';
comment on column public.private_pay_payments.failure_message is
  'Stripe decline / authentication error message when status = failed.';

-- One in-flight card charge per invoice (prevents duplicate concurrent charges).
create unique index if not exists private_pay_payments_invoice_pending_uidx
  on public.private_pay_payments (invoice_id)
  where status = 'pending' and payment_method = 'card';

-- ---------------------------------------------------------------------------
-- updated_at trigger for customers
-- ---------------------------------------------------------------------------
create or replace function public.touch_private_pay_customers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists private_pay_customers_updated_at on public.private_pay_customers;
create trigger private_pay_customers_updated_at
  before update on public.private_pay_customers
  for each row
  execute function public.touch_private_pay_customers_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security — manager / admin / super_admin (matches other private_pay_*)
-- ---------------------------------------------------------------------------
alter table public.private_pay_customers enable row level security;
alter table public.private_pay_payment_methods enable row level security;

do $$
declare
  t text;
  tbls text[] := array['private_pay_customers', 'private_pay_payment_methods'];
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
