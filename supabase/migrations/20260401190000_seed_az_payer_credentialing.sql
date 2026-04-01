-- Arizona home health payer seed for payer_credentialing_records.
-- Idempotent: re-run skips rows that already exist for the same market_state + normalized payer_name.
-- Dedupe: NOT EXISTS on lower(trim(payer_name)) and market_state = 'AZ' (no unique index required).

alter table public.payer_credentialing_records
  drop constraint if exists payer_credentialing_records_contract_status_check;

alter table public.payer_credentialing_records
  add constraint payer_credentialing_records_contract_status_check
  check (
    contracting_status in ('not_started', 'pending', 'in_contracting', 'contracted', 'stalled')
  );

insert into public.payer_credentialing_records (
  payer_name,
  payer_type,
  market_state,
  credentialing_status,
  contracting_status
)
select
  v.payer_name,
  v.payer_type,
  v.market_state,
  v.credentialing_status,
  v.contracting_status
from (
  values
    ('Original Medicare', 'Medicare', 'AZ', 'not_started', 'not_started'),
    ('AHCCCS', 'Medicaid', 'AZ', 'not_started', 'not_started'),
    ('UnitedHealthcare', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Humana', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Aetna', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Banner – University Family Care', 'Medicaid', 'AZ', 'not_started', 'not_started'),
    ('Mercy Care', 'Medicaid', 'AZ', 'not_started', 'not_started'),
    ('Arizona Complete Health', 'Medicaid', 'AZ', 'not_started', 'not_started'),
    ('Care1st Health Plan Arizona', 'Medicaid', 'AZ', 'not_started', 'not_started'),
    ('Health Choice Arizona', 'Medicaid', 'AZ', 'not_started', 'not_started'),
    ('Blue Cross Blue Shield of Arizona', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Cigna Healthcare', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Wellcare', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Devoted Health', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('SCAN Health Plan', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Molina Healthcare', 'Medicaid', 'AZ', 'not_started', 'not_started'),
    ('Alignment Health Plan', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Bright Health', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('Oscar Health', 'Medicare Advantage', 'AZ', 'not_started', 'not_started'),
    ('TriWest Healthcare Alliance', 'VA', 'AZ', 'not_started', 'not_started')
) as v(payer_name, payer_type, market_state, credentialing_status, contracting_status)
where not exists (
  select 1
  from public.payer_credentialing_records p
  where p.market_state = v.market_state
    and lower(trim(p.payer_name)) = lower(trim(v.payer_name))
);
