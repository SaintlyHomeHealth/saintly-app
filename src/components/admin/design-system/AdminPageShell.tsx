import type { ReactNode } from "react";

import { adminPageBgCls } from "./admin-design-tokens";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Standard admin page wrapper: sky gradient background, consistent vertical rhythm.
 * Use on CRM, HR, credentialing, and pipeline list pages.
 */
export function AdminPageShell({ children, className = "" }: Props) {
  return <div className={`${adminPageBgCls} ${className}`.trim()}>{children}</div>;
}
