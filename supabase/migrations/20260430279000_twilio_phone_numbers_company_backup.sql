-- Single backup company/shared SMS line marker (pairs with is_primary_company_number).

alter table public.twilio_phone_numbers
  add column if not exists is_company_backup_number boolean not null default false;

create unique index if not exists twilio_phone_numbers_one_company_backup
  on public.twilio_phone_numbers (is_company_backup_number)
  where is_company_backup_number = true;
