import Link from "next/link";
import type { ReactNode } from "react";

import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";

import { adminEmptyStateCls } from "./admin-design-tokens";

type Props = {
  title: string;
  description?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

export function AdminEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  className = "",
}: Props) {
  return (
    <div className={`${adminEmptyStateCls} ${className}`.trim()}>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description ? <div className="mt-2 text-sm text-slate-600">{description}</div> : null}
      {actionHref && actionLabel ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href={actionHref} prefetch={false} className={crmPrimaryCtaCls}>
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
