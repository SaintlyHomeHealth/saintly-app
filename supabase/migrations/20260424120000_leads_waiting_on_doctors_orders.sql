-- Critical intake flag: blocks scheduling until signed physician orders are received.

alter table public.leads
  add column if not exists waiting_on_doctors_orders boolean not null default false;

comment on column public.leads.waiting_on_doctors_orders is 'When true, staff must not schedule/start until signed doctor orders are received.';
