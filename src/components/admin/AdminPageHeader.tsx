import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  /** Small uppercase label above the title (e.g. "Operations", "Administration") */
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  /** Right column: primary actions, links, etc. */
  actions?: ReactNode;
};

/**
 * Standard admin page title block: eyebrow, title, description, optional actions.
 */
export function AdminPageHeader({ eyebrow, title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</p>
        ) : null}
        <h1 className={`text-2xl font-bold text-slate-900 ${eyebrow ? "mt-1" : ""}`}>{title}</h1>
        {description ? <div className="mt-1 max-w-2xl text-sm text-slate-600">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
