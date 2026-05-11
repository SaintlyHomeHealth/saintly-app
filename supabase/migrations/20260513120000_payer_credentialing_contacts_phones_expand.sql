-- Expand payer credentialing contacts: multiple phone slots + secondary email.
-- Backfill office_phone from legacy `phone`; keep `phone` for compatibility (app mirrors office into it).

alter table public.payer_credentialing_record_contacts
  add column if not exists office_phone text,
  add column if not exists mobile_phone text,
  add column if not exists other_phone text,
  add column if not exists other_phone_label text,
  add column if not exists fax text,
  add column if not exists secondary_email text;

-- Existing rows: treat stored `phone` as office line.
update public.payer_credentialing_record_contacts
set office_phone = phone
where coalesce(btrim(office_phone), '') = ''
  and phone is not null
  and btrim(phone) <> '';

alter table public.payer_credentialing_record_contacts
  drop constraint if exists payer_cred_record_contact_has_identifier;

alter table public.payer_credentialing_record_contacts
  add constraint payer_cred_record_contact_has_identifier check (
    length(btrim(coalesce(name, ''))) > 0
    or length(btrim(coalesce(email, ''))) > 0
    or length(btrim(coalesce(secondary_email, ''))) > 0
    or length(btrim(coalesce(phone, ''))) > 0
    or length(btrim(coalesce(office_phone, ''))) > 0
    or length(btrim(coalesce(mobile_phone, ''))) > 0
    or length(btrim(coalesce(other_phone, ''))) > 0
    or length(btrim(coalesce(fax, ''))) > 0
  );

alter table public.payer_credentialing_record_contacts
  drop constraint if exists payer_cred_record_contact_secondary_email_trim;

alter table public.payer_credentialing_record_contacts
  add constraint payer_cred_record_contact_secondary_email_trim check (
    secondary_email is null or btrim(secondary_email) = secondary_email
  );

alter table public.payer_credentialing_record_contacts
  drop constraint if exists payer_cred_record_contact_office_phone_trim;

alter table public.payer_credentialing_record_contacts
  add constraint payer_cred_record_contact_office_phone_trim check (
    office_phone is null or btrim(office_phone) = office_phone
  );

alter table public.payer_credentialing_record_contacts
  drop constraint if exists payer_cred_record_contact_mobile_phone_trim;

alter table public.payer_credentialing_record_contacts
  add constraint payer_cred_record_contact_mobile_phone_trim check (
    mobile_phone is null or btrim(mobile_phone) = mobile_phone
  );

alter table public.payer_credentialing_record_contacts
  drop constraint if exists payer_cred_record_contact_other_phone_trim;

alter table public.payer_credentialing_record_contacts
  add constraint payer_cred_record_contact_other_phone_trim check (
    other_phone is null or btrim(other_phone) = other_phone
  );

alter table public.payer_credentialing_record_contacts
  drop constraint if exists payer_cred_record_contact_other_phone_label_trim;

alter table public.payer_credentialing_record_contacts
  add constraint payer_cred_record_contact_other_phone_label_trim check (
    other_phone_label is null or btrim(other_phone_label) = other_phone_label
  );

alter table public.payer_credentialing_record_contacts
  drop constraint if exists payer_cred_record_contact_fax_trim;

alter table public.payer_credentialing_record_contacts
  add constraint payer_cred_record_contact_fax_trim check (
    fax is null or btrim(fax) = fax
  );

comment on column public.payer_credentialing_record_contacts.office_phone is
  'Main office / desk phone; legacy `phone` column is kept in sync for older readers.';
comment on column public.payer_credentialing_record_contacts.secondary_email is
  'Optional second email for this contact (distinct from primary `email`).';
