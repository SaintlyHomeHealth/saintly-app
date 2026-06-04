-- Private Pay billing: expand manual payment methods, capture manual payment
-- reference/confirmation numbers, and add a stable public token for HIPAA-safe
-- shareable invoice/payment links (no PHI). Card payments still flow through Stripe.

-- ---------------------------------------------------------------------------
-- Payment methods: add Cash App, Apple Cash, and an explicit "other" bucket.
-- "manual" is retained for backward compatibility with existing rows.
-- ---------------------------------------------------------------------------
alter table public.private_pay_payments
  drop constraint if exists private_pay_payments_payment_method_check;

alter table public.private_pay_payments
  add constraint private_pay_payments_payment_method_check
  check (payment_method in ('card', 'zelle', 'cashapp', 'apple_cash', 'cash', 'check', 'manual', 'other'));

-- Manual payment confirmation / reference number (Zelle ref, Cash App $cashtag note,
-- Apple Cash, check number, etc.). Never a card PAN.
alter table public.private_pay_payments
  add column if not exists payment_reference text;

comment on column public.private_pay_payments.payment_reference is
  'Manual payment confirmation / reference number (Zelle, Cash App, Apple Cash, check #, etc). Never a card number.';

-- ---------------------------------------------------------------------------
-- Public token for the HIPAA-safe shareable invoice / payment link.
-- The token is the only secret; the public page shows no diagnosis, insurance,
-- Medicare, or clinical information.
-- ---------------------------------------------------------------------------
alter table public.private_pay_invoices
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists private_pay_invoices_public_token_uidx
  on public.private_pay_invoices (public_token);

comment on column public.private_pay_invoices.public_token is
  'Opaque token for the public invoice/payment link (/private-pay/pay/[token]). Carries no PHI.';
