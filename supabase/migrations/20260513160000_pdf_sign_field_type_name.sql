-- Allow `name` field type on Saintly PDF Sign templates (editor UI additive field).

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
      'select',
      'name'
    )
  );
