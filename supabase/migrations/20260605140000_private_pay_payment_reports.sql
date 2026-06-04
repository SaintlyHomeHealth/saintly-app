-- Customer-reported manual payments ("I sent payment"). Does NOT mark invoices paid.

create table if not exists public.private_pay_payment_reports (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.private_pay_invoices(id) on delete cascade,
  payment_method text not null check (
    payment_method in ('zelle', 'cashapp', 'apple_cash', 'cash', 'check', 'other')
  ),
  amount_cents integer,
  reported_date date,
  payment_reference text,
  customer_note text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists private_pay_payment_reports_invoice_idx
  on public.private_pay_payment_reports (invoice_id, created_at desc);

create index if not exists private_pay_payment_reports_pending_idx
  on public.private_pay_payment_reports (invoice_id)
  where status = 'pending';

alter table public.private_pay_payment_reports enable row level security;

do $$
declare
  t text := 'private_pay_payment_reports';
begin
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
end;
$$;
