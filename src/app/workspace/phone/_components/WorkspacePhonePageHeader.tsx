import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned actions (filters, search trigger, etc.) */
  actions?: ReactNode;
};

/**
 * Shared page chrome for workspace phone routes — keeps titles, spacing, and hierarchy consistent.
 */
export function WorkspacePhonePageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
