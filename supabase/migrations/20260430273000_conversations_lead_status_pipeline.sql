-- SMS intake pipeline: align `conversations.lead_status` with app (new, spoke, verify_insurance, …).

alter table public.conversations
  drop constraint if exists conversations_lead_status_check;

update public.conversations
set lead_status = case lower(trim(coalesce(lead_status, '')))
  when '' then 'new'
  when 'new_lead' then 'new'
  when 'contacted' then 'spoke'
  when 'unclassified' then 'new'
  when 'new' then 'new'
  when 'spoke' then 'spoke'
  when 'verify_insurance' then 'verify_insurance'
  when 'scheduled' then 'scheduled'
  when 'admitted' then 'admitted'
  when 'not_qualified' then 'not_qualified'
  else 'new'
end;

alter table public.conversations
  alter column lead_status set default 'new';

alter table public.conversations
  alter column lead_status set not null;

alter table public.conversations
  add constraint conversations_lead_status_check
  check (
    lead_status = any (
      array[
        'new'::text,
        'spoke'::text,
        'verify_insurance'::text,
        'scheduled'::text,
        'admitted'::text,
        'not_qualified'::text
      ]
    )
  );

comment on column public.conversations.lead_status is
  'SMS intake pipeline: new, spoke, verify_insurance, scheduled, admitted, not_qualified.';
