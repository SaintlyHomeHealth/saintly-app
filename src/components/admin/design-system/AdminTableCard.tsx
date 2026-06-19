import type { ReactNode } from "react";

import { adminTableCardCls } from "./admin-design-tokens";

type Props = {
  children: ReactNode;
  className?: string;
  minWidth?: string;
};

/** Scrollable table/list container with modern card chrome. */
export function AdminTableCard({ children, className = "", minWidth }: Props) {
  return (
    <div className={`${adminTableCardCls} ${className}`.trim()}>
      <div style={minWidth ? { minWidth } : undefined}>{children}</div>
    </div>
  );
}

export { adminTableHeaderCls, adminTableRowCls, adminTableRowHoverCls } from "./admin-design-tokens";
