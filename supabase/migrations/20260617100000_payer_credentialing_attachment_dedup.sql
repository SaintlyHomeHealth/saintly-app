-- Dedup payer credentialing attachments per carrier record (SHA-256 content hash).

alter table public.payer_credentialing_attachments
  add column if not exists file_hash_sha256 text;

comment on column public.payer_credentialing_attachments.file_hash_sha256 is
  'SHA-256 hex digest of file bytes; used to prevent duplicate uploads for the same carrier.';

create unique index if not exists payer_cred_attachments_record_hash_uidx
  on public.payer_credentialing_attachments (credentialing_record_id, file_hash_sha256)
  where file_hash_sha256 is not null;
