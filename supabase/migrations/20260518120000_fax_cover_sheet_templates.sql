-- Fax Center: reusable cover sheet templates and outbound packet metadata.

-- Shared by fax_messages, fax_contact_numbers, and fax_cover_sheet_templates.
create or replace function public.touch_fax_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.fax_cover_sheet_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  default_subject text not null default '',
  default_message text not null default '',
  is_default boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fax_cover_sheet_templates_slug_key unique (slug)
);

-- At most one template may be marked default (enforced at DB level).
drop index if exists public.fax_cover_sheet_templates_default_idx;
create unique index if not exists fax_cover_sheet_templates_one_default_idx
  on public.fax_cover_sheet_templates ((true))
  where is_default = true;

create index if not exists fax_cover_sheet_templates_sort_idx
  on public.fax_cover_sheet_templates (sort_order, name);

drop trigger if exists fax_cover_sheet_templates_updated_at on public.fax_cover_sheet_templates;
create trigger fax_cover_sheet_templates_updated_at
  before update on public.fax_cover_sheet_templates
  for each row
  execute function public.touch_fax_updated_at();

alter table public.fax_messages
  add column if not exists cover_sheet_template_id uuid
    references public.fax_cover_sheet_templates (id) on delete set null;

alter table public.fax_messages
  add column if not exists packet_metadata jsonb;

create index if not exists fax_messages_cover_template_idx
  on public.fax_messages (cover_sheet_template_id)
  where cover_sheet_template_id is not null;

alter table public.fax_cover_sheet_templates enable row level security;

drop policy if exists "fax_cover_sheet_templates_select_staff" on public.fax_cover_sheet_templates;
create policy "fax_cover_sheet_templates_select_staff"
  on public.fax_cover_sheet_templates for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_cover_sheet_templates_write_staff" on public.fax_cover_sheet_templates;
create policy "fax_cover_sheet_templates_write_staff"
  on public.fax_cover_sheet_templates for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

-- Starter templates (Saintly return fax only).
insert into public.fax_cover_sheet_templates (name, slug, default_subject, default_message, is_default, is_system, sort_order)
values
  (
    'Signed 485 / Plan of Care Request',
    'signed-485-plan-of-care',
    'Signed 485 / Plan of Care Request',
    'Please review and sign the attached 485 / plan of care and return via fax at your earliest convenience. Thank you for your partnership in patient care.',
    true,
    true,
    10
  ),
  (
    'Referral Request',
    'referral-request',
    'Referral Request',
    'Please find the attached referral information for your review. We appreciate your prompt attention and look forward to coordinating care.',
    false,
    true,
    20
  ),
  (
    'Physician Order Signature Request',
    'physician-order-signature',
    'Physician Order Signature Request',
    'Please review, sign, and return the attached physician orders at your earliest convenience. Contact our office with any questions.',
    false,
    true,
    30
  ),
  (
    'Wound Care Order Request',
    'wound-care-order',
    'Wound Care Order Request',
    'Please review and sign the attached wound care orders. Return the signed orders via fax so we may proceed with the ordered services.',
    false,
    true,
    40
  ),
  (
    'General Records Request',
    'general-records-request',
    'Medical Records Request',
    'Please send the requested medical records for the patient listed below. If you have questions regarding this request, please contact our office.',
    false,
    true,
    50
  )
on conflict (slug) do nothing;
