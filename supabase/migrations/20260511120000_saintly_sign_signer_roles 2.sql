-- ---------------------------------------------------------------------------
-- Saintly Sign · expand signer_role check to include recruit + lead.
--
-- The visual template editor lets admins assign each placed field to a signer
-- role. The original constraint was limited to employee/contractor/company/
-- admin/recipient. CRM workflows now also send packets to Recruit and Lead
-- records, so admins want to be able to model those signer roles per field.
-- ---------------------------------------------------------------------------

alter table public.signature_template_fields
  drop constraint if exists signature_template_fields_signer_role_check;

alter table public.signature_template_fields
  add constraint signature_template_fields_signer_role_check
    check (
      signer_role in (
        'employee',
        'contractor',
        'recruit',
        'lead',
        'company',
        'admin',
        'recipient'
      )
    );
