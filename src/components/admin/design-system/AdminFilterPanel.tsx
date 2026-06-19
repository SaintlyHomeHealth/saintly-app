import type { FormHTMLAttributes, ReactNode } from "react";

import { adminFilterCardCls, adminFilterLabelCls } from "./admin-design-tokens";

type Props = FormHTMLAttributes<HTMLFormElement> & {
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Rounded filter card shell for GET/POST filter forms.
 */
export function AdminFilterPanel({ children, footer, className = "", ...formProps }: Props) {
  return (
    <form className={`${adminFilterCardCls} ${className}`.trim()} {...formProps}>
      {children}
      {footer ? <div className="mt-4 flex flex-wrap items-center gap-2">{footer}</div> : null}
    </form>
  );
}

export function AdminFilterLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`${adminFilterLabelCls} ${className}`.trim()}>{children}</span>;
}
