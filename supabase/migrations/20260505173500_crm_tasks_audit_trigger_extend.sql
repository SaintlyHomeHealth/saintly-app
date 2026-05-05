-- Extend CRM tasks audit trigger: immutable ai_transcript, server-driven completed_at transitions.

create or replace function public.crm_tasks_enforce_audit_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'done' and new.completed_at is null then
      new.completed_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.source := old.source;
    new.ai_transcript := old.ai_transcript;

    if new.status = 'done' and old.status is distinct from 'done' then
      new.completed_at := now();
    elsif new.status is distinct from 'done' then
      new.completed_at := null;
    else
      new.completed_at := old.completed_at;
    end if;
    return new;
  end if;

  return new;
end;
$$;
