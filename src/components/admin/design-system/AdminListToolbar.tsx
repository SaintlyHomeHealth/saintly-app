import type { ReactNode } from "react";

import { adminToolbarCls } from "./admin-design-tokens";

type Props = {
  primary: ReactNode;
  secondary?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Summary strip above lists: counts, pagination, density, clear filters. */
export function AdminListToolbar({ primary, secondary, actions, className = "" }: Props) {
  return (
    <div className={`${adminToolbarCls} ${className}`.trim()}>
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-semibold text-slate-900">{primary}</div>
        {secondary ? <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">{secondary}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
