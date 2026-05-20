-- ---------------------------------------------------------------------------
-- Saintly Sign · Assigned-to model + sender prefill state.
--
-- The visual editor was simplifying signer assignment from a confusing
-- "CRM source type" mix (employee/contractor/recruit/lead/company/admin) to a
-- 3-bucket model: recipient / sender / internal. The DB constraint now
-- accepts the new canonical values alongside the legacy ones (which are
-- normalised at read time so existing template rows keep working).
--
-- We also add `sender_state jsonb` on signature_packets to hold values + drawn
-- signature paths produced by the admin during the new "Step 3 — Saintly
-- fields" flow on the send page, so they can be flattened into the final PDF
-- when the recipient finishes signing.
-- ---------------------------------------------------------------------------

alter table public.signature_template_fields
  drop constraint if exists signature_template_fields_signer_role_check;

alter table public.signature_template_fields
  add constraint signature_template_fields_signer_role_check
    check (
      signer_role in (
        -- Canonical bucket values used by the new editor UI.
        'recipient',
        'sender',
        'internal',
        -- Legacy values still allowed for backward compatibility with rows
        -- saved by the older editor. App code normalises these via
        -- `assignedToFromSignerRole`.
        'employee',
        'contractor',
        'recruit',
        'lead',
        'company',
        'admin'
      )
    );

alter table public.signature_packets
  add column if not exists sender_state jsonb not null default '{}'::jsonb;

comment on column public.signature_packets.sender_state is
  'Saintly Sign · admin-side prefill captured during the send flow. Shape: '
  '{ values: { [field_key]: string|boolean }, signaturePaths: { [field_key]: { bucket, path } }, completedAt: iso }.';
