-- Allow sales-agent order uploads of a driver's license photo.
alter table public.lead_documents
  drop constraint if exists lead_documents_document_type_check;

alter table public.lead_documents
  add constraint lead_documents_document_type_check
  check (
    document_type in (
      'medicare_card_front',
      'medicare_card_back',
      'insurance_card_front',
      'insurance_card_back',
      'drivers_license'
    )
  );

comment on table public.lead_documents is
  'PHI-eligible Medicare/insurance/DL images for CRM leads; private bucket lead-documents.';
