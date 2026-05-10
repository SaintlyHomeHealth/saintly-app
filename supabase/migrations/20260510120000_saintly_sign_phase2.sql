-- ---------------------------------------------------------------------------
-- Saintly Sign · phase 2 — templates/packets/fields/recipients/metadata
--
-- Relaxes document type slugs, expands field types, adds first-class columns
-- for template field signing roles and packet send/recipient snapshot data,
-- plus storage for drawn signatures and field-level image assets.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- signature_templates: arbitrary document_type slug (1–80 chars)
-- ---------------------------------------------------------------------------

alter table public.signature_templates
  drop constraint if exists signature_templates_document_type_check;

alter table public.signature_templates
  add constraint signature_templates_document_type_check
    check (
      char_length(document_type) >= 1
      and char_length(document_type) <= 80
    );

comment on column public.signature_templates.document_type is
  'User-defined slug (1–80 chars). No longer limited to generic_contract / w9 / i9.';

-- ---------------------------------------------------------------------------
-- signature_template_fields: field types + signer columns + required/prefill/pages
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
  add column if not exists signer_role text not null default 'employee';

alter table public.signature_template_fields
  drop constraint if exists signature_template_fields_signer_role_check;

alter table public.signature_template_fields
  add constraint signature_template_fields_signer_role_check
    check (
      signer_role in (
        'employee',
        'contractor',
        'company',
        'admin',
        'recipient'
      )
    );

alter table public.signature_template_fields
  add column if not exists required boolean not null default true;

alter table public.signature_template_fields
  add column if not exists prefill_value text;

alter table public.signature_template_fields
  add column if not exists page_width double precision;

alter table public.signature_template_fields
  add column if not exists page_height double precision;

-- Best-effort backfill from legacy options jsonb (written by earlier editor APIs).
update public.signature_template_fields
set signer_role = (options->>'signer_role')
where (options->>'signer_role') in ('employee', 'contractor', 'company', 'admin', 'recipient');

update public.signature_template_fields
set required = case
  when coalesce((options->>'optional')::boolean, false) then false
  else true
end;

update public.signature_template_fields
set prefill_value = nullif(trim(options->>'prefill_value'), '')
where options ? 'prefill_value'
  and (prefill_value is null or prefill_value = '');

update public.signature_template_fields
set
  page_width = (nullif(options->>'page_width', ''))::double precision,
  page_height = (nullif(options->>'page_height', ''))::double precision
where (options ? 'page_width' or options ? 'page_height')
  and page_width is null
  and page_height is null;

comment on column public.signature_template_fields.signer_role is
  'Who fills this field in the signing model (expanded in later migrations).';

comment on column public.signature_template_fields.required is
  'When false, recipient may skip (mirrors legacy options.optional = true as required = false).';

comment on column public.signature_template_fields.prefill_value is
  'Optional static prefill for staff/internal fields.';

comment on column public.signature_template_fields.page_width is
  'PDF page width in points when the field was authored (editor snapshot).';

comment on column public.signature_template_fields.page_height is
  'PDF page height in points when the field was authored (editor snapshot).';

comment on column public.signature_template_fields.options is
  'Additional JSON: validation_kind, autofill_source, autofit_text, signer_editable, legacy keys, etc.';

-- ---------------------------------------------------------------------------
-- signature_packets: relax primary_document_type + send/recipient snapshot columns
-- ---------------------------------------------------------------------------

alter table public.signature_packets
  drop constraint if exists signature_packets_primary_document_type_check;

alter table public.signature_packets
  add constraint signature_packets_primary_document_type_check
    check (
      char_length(primary_document_type) >= 1
      and char_length(primary_document_type) <= 80
    );

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

-- One signing recipient per packet in typical flows — take the first row per packet.
update public.signature_packets p
set
  recipient_name = r.display_name,
  recipient_email = r.email,
  viewed_at = coalesce(p.viewed_at, r.last_viewed_at)
from (
  select distinct on (packet_id)
    packet_id,
    display_name,
    email,
    last_viewed_at
  from public.signature_recipients
  order by packet_id, created_at asc, id asc
) r
where p.id = r.packet_id;

create index if not exists signature_packets_status_completed_idx
  on public.signature_packets (status, completed_at desc)
  where status in ('completed', 'signed');

create index if not exists signature_packets_recipient_record_idx
  on public.signature_packets (recipient_type, recipient_record_id);

comment on column public.signature_packets.title is
  'Human title for the signing request (shown in admin + optional client UX).';

comment on column public.signature_packets.recipient_type is
  'CRM / internal discriminator for recipient_record_id (e.g. applicant, lead).';

comment on column public.signature_packets.recipient_record_id is
  'Primary CRM entity id for the recipient, when distinct from crm_entity_id.';

comment on column public.signature_packets.recipient_name is
  'Snapshot of recipient display name at send time.';

comment on column public.signature_packets.recipient_email is
  'Snapshot of recipient email at send time.';

comment on column public.signature_packets.recipient_phone is
  'Snapshot of recipient phone for SMS / contact flows.';

comment on column public.signature_packets.message is
  'Optional staff message included with the signing request.';

comment on column public.signature_packets.sent_at is
  'When the packet left draft / was issued to the recipient.';

comment on column public.signature_packets.viewed_at is
  'First time the recipient opened the signing link (mirrors recipient.last_viewed_at when backfilled).';

comment on column public.signature_packets.completed_pdf_storage_bucket is
  'Storage bucket for flattened completed PDF (packet-level aggregate).';

comment on column public.signature_packets.completed_pdf_storage_path is
  'Object path for flattened completed PDF (packet-level aggregate).';

comment on column public.signature_packets.sms_requested is
  'True when staff requested an SMS with the signing link.';

comment on column public.signature_packets.sms_sent_at is
  'When the signing SMS was dispatched (null if email-only or pending).';

comment on column public.signature_packets.sms_error is
  'Last SMS delivery error message, if any.';

-- ---------------------------------------------------------------------------
-- signature_field_values: image asset columns for drawn signatures / uploads
-- ---------------------------------------------------------------------------

alter table public.signature_field_values
  add column if not exists image_storage_bucket text;

alter table public.signature_field_values
  add column if not exists image_storage_path text;

alter table public.signature_field_values
  add column if not exists signed_at timestamptz;

comment on column public.signature_field_values.image_storage_bucket is
  'Private bucket id when the field value is stored as an image object.';

comment on column public.signature_field_values.image_storage_path is
  'Object path for image-backed field values (e.g. signature PNG).';

comment on column public.signature_field_values.signed_at is
  'When the signer committed this field (optional; updated_at remains the generic touch time).';

-- ---------------------------------------------------------------------------
-- signature_recipients: phone for SMS
-- ---------------------------------------------------------------------------

alter table public.signature_recipients
  add column if not exists phone text;

comment on column public.signature_recipients.phone is
  'E.164 or normalized phone for SMS delivery of the signing link.';

-- ---------------------------------------------------------------------------
-- Storage: signature-images bucket + staff policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('signature-images', 'signature-images', false)
on conflict (id) do nothing;

-- Remove legacy policy names from earlier experimental migrations (if present).
drop policy if exists "signature_images_bucket_select" on storage.objects;
drop policy if exists "signature_images_bucket_write" on storage.objects;

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
