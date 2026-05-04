-- Idempotent cleanup if an earlier deploy failed mid-migration or the legacy unique
-- object survived. Safe when 20260504120000 already applied fully (all statements no-op).
alter table public.employee_contracts
  drop constraint if exists employee_contracts_applicant_effective_unique;

drop index if exists public.employee_contracts_applicant_effective_unique;
