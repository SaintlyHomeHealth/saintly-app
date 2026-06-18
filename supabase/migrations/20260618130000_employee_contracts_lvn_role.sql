-- Allow LVN as an employee contract role (aligns with recruiting/onboarding discipline lists).

alter table public.employee_contracts
  drop constraint if exists employee_contracts_role_key_check;

alter table public.employee_contracts
  add constraint employee_contracts_role_key_check
  check (role_key in ('rn', 'lvn', 'pt', 'st', 'msw', 'hha'));
