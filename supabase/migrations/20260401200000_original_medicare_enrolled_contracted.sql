-- Original Medicare is already enrolled / contracted for Arizona fee-for-service; show as complete in the command center.
update public.payer_credentialing_records
set
  credentialing_status = 'enrolled',
  contracting_status = 'contracted',
  updated_at = now()
where
  market_state = 'AZ'
  and lower(trim(payer_name)) = lower(trim('Original Medicare'));
