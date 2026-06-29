-- PT per-visit rate schedule (SOC, OASIS, eval, visit, PTA) stored as structured JSON.
alter table public.employee_contracts
  add column if not exists per_visit_rates jsonb;

comment on column public.employee_contracts.per_visit_rates is
  'Optional PT per-visit rate schedule: soc, dc_roc_recert_oasis, pt_eval, pt_visit, pta (numbers or null).';
