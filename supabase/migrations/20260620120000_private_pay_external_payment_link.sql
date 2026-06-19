-- Optional Square / external payment URL shown on public invoices.

alter table public.private_pay_invoices
  add column if not exists external_payment_link text;

comment on column public.private_pay_invoices.external_payment_link is
  'Optional staff-entered payment URL (e.g. Square). Shown as Pay securely on the public invoice when set.';
