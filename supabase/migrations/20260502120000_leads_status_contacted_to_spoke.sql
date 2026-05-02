-- Legacy CRM pipeline value `contacted` is redundant with `spoke`; normalize stored rows.
update public.leads
set status = 'spoke'
where lower(trim(status)) = 'contacted';
