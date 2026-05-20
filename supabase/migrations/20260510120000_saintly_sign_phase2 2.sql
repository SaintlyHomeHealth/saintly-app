-- Saintly Sign (PDF Sign) phase 2: full DocuSign-style packet workflow.
--
-- Additive changes:
-- * Allow custom signature template document_type values (drop hard CHECK).
-- * Add visual-editor field metadata: width/height already exist; add signer_role,
--   page_width/page_height (PDF coordinate snapshot), and `initials` field type.
-- * Snapshot packet recipient + delivery metadata directly on signature_packets so the
--   packet listing/detail pages can render without joins, while keeping the secure
--   token in signature_recipients.
-- * Track sent/viewed/SMS delivery + completed PDF path on the packet itself.
-- * Persist drawn / typed signature images via signature_field_values.image_storage_path
--   (no schema change required for the cell - image bytes live in storage).
-- * Adds the signature-image storage bucket (private).
-- * No template rows are seeded.

-- ---------------------------------------------------------------------------
-- signature_templates: allow arbitrary document_type strings
-- ---------------------------------------------------------------------------
alter table public.signature_templates
  drop constraint if exists signature_templates_document_type_check;

-- We still want to keep the column non-null and trim to a sensible length.
alter table public.signature_templates
  add constraint signature_templates_document_type_check
    check (char_length(trim(document_type)) between 1 and 80);

-- ---------------------------------------------------------------------------
-- signature_template_fields: add `initials` field type + signer_role + label_short
-- ---------------------------------------------------------------------------
alter table public.signature_template_fields
  drop constraint if exists signature_template_fields_field_type_check;

alter table public.signature_template_fields
  add constraint signature_template_fields_field_type_check
    check (
      field_type in (
        'text',
        'textarea',
        'date',
        'checkbox',
        'signature',
        'initials',
        'tin',
        'select'
      )
    );

alter table public.signature_template_fields
  add column if not exists signer_role text not null default 'employee'
    check (signer_role in ('employee', 'contractor', 'company', 'admin', 'recipient'));

alter table public.signature_template_fields
  add column if not exists required boolean not null default true;

alter table public.signature_template_fields
  add column if not exists prefill_value text;

-- Snapshot of the PDF page dimensions in PDF user-space points so the editor + signing
-- page can recompute pixel positions consistently across screen sizes.
alter table public.signature_template_fields
  add column if not exists page_width double precision;

alter table public.signature_template_fields
  add column if not exists page_height double precision;

-- ---------------------------------------------------------------------------
-- signature_packets: snapshot recipient + delivery + completed PDF path
-- ---------------------------------------------------------------------------
alter table public.signature_packets
  drop constraint if exists signature_packets_primary_document_type_check;

alter table public.signature_packets
  add constraint signature_packets_primary_document_type_check
    check (char_length(trim(primary_document_type)) between 1 and 80);

alter table public.signature_packets
  add column if not exists title text;

alter table public.signature_packets
  add column if not exists recipient_type text;

alter table public.signature_packets
  add column if not exists recipient_record_id uuid;

alter table public.signature_packets
  add column if not exists recipient_name text;

alter table public.signature_packets
  add column if not exists recipient_email text;

alter table public.signature_packets
  add column if not exists recipient_phone text;

alter table public.signature_packets
  add column if not exists message text;

alter table public.signature_packets
  add column if not exists sent_at timestamptz;

alter table public.signature_packets
  add column if not exists viewed_at timestamptz;

alter table public.signature_packets
  add column if not exists completed_pdf_storage_bucket text;

alter table public.signature_packets
  add column if not exists completed_pdf_storage_path text;

alter table public.signature_packets
  add column if not exists sms_requested boolean not null default false;

alter table public.signature_packets
  add column if not exists sms_sent_at timestamptz;

alter table public.signature_packets
  add column if not exists sms_error text;

-- Backfill recipient snapshot from existing signature_recipients rows for packets
-- created before this migration (best-effort, picks the first signer recipient).
update public.signature_packets p
set
  recipient_email = coalesce(p.recipient_email, r.email),
  recipient_name = coalesce(p.recipient_name, r.display_name),
  viewed_at = coalesce(p.viewed_at, r.last_viewed_at)
from public.signature_recipients r
where r.packet_id = p.id
  and (p.recipient_email is null or p.recipient_name is null or p.viewed_at is null);

create index if not exists signature_packets_status_completed_idx
  on public.signature_packets (status, completed_at desc);
create index if not exists signature_packets_recipient_record_idx
  on public.signature_packets (recipient_type, recipient_record_id, created_at desc)
  where recipient_record_id is not null;

-- ---------------------------------------------------------------------------
-- signature_field_values: store optional reference to drawn signature image
-- ---------------------------------------------------------------------------
alter table public.signature_field_values
  add column if not exists image_storage_bucket text;

alter table public.signature_field_values
  add column if not exists image_storage_path text;

alter table public.signature_field_values
  add column if not exists signed_at timestamptz;

-- ---------------------------------------------------------------------------
-- signature_recipients: track phone snapshot at create time
-- ---------------------------------------------------------------------------
alter table public.signature_recipients
  add column if not exists phone text;

-- ---------------------------------------------------------------------------
-- Storage bucket for signature images (private; signed URLs only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('signature-images', 'signature-images', false)
on conflict (id) do nothing;

drop policy if exists "signature_images_select_staff" on storage.objects;
create policy "signature_images_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signature-images'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'credentialing')
    )
  );

drop policy if exists "signature_images_write_staff" on storage.objects;
create policy "signature_images_write_staff"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'signature-images'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'signature-images'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

comment on column public.signature_packets.title is
  'Human-readable packet title shown in admin tracking + recipient email subject.';
comment on column public.signature_packets.recipient_type is
  'employee|recruit|lead|facility_contact|manual';
comment on column public.signature_packets.completed_pdf_storage_path is
  'Convenience snapshot of the completed/flattened PDF path; the canonical path also lives on signature_packet_documents.completed_storage_path.';
comment on column public.signature_field_values.image_storage_path is
  'Path to drawn signature PNG in `signature-images` bucket (when field_type = signature/initials and signer drew or typed an image).';
