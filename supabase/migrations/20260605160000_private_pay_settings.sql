-- Admin-editable private pay payment instructions (singleton row).

create table if not exists public.private_pay_settings (
  id text primary key default 'default' check (id = 'default'),
  zelle_name text,
  zelle_phone text,
  zelle_email text,
  cashapp_tag text,
  apple_cash_phone text,
  apple_cash_email text,
  check_payable_to text,
  mailing_address text,
  manual_note text,
  show_zelle boolean not null default true,
  show_cashapp boolean not null default true,
  show_apple_cash boolean not null default true,
  show_cash_check boolean not null default true,
  show_stripe boolean not null default true,
  preferred_payment_method text not null default 'zelle' check (preferred_payment_method in ('zelle')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.private_pay_settings (id, zelle_name, check_payable_to)
values ('default', 'Saintly Home Health LLC', 'Saintly Home Health LLC')
on conflict (id) do nothing;

alter table public.private_pay_settings enable row level security;

drop policy if exists "private_pay_settings_select_staff" on public.private_pay_settings;
create policy "private_pay_settings_select_staff" on public.private_pay_settings
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "private_pay_settings_update_staff" on public.private_pay_settings;
create policy "private_pay_settings_update_staff" on public.private_pay_settings
  for update to authenticated
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
  );

drop policy if exists "private_pay_settings_insert_staff" on public.private_pay_settings;
create policy "private_pay_settings_insert_staff" on public.private_pay_settings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
