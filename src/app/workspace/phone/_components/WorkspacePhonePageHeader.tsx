import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned actions (filters, search trigger, etc.) */
  actions?: ReactNode;
  className?: string;
};

/**
 * Shared page chrome for workspace phone routes — keeps titles, spacing, and hierarchy consistent.
 */
export function WorkspacePhonePageHeader({ title, subtitle, actions, className = "" }: Props) {
  return (
    <div
      className={`mb-3 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-3 ${className}`.trim()}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-phone-navy sm:text-2xl sm:text-[1.65rem]">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 max-w-2xl text-xs leading-snug text-slate-600 sm:mt-1 sm:text-sm sm:leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
