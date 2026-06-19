import Link from "next/link";
import type { ReactNode } from "react";

import { adminBadgeBaseCls } from "./admin-design-tokens";

export type AdminBadgeVariant =
  | "neutral"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "indigo"
  | "violet"
  | "slate";

const VARIANT_CLS: Record<AdminBadgeVariant, string> = {
  neutral: "border-slate-200/90 bg-white text-slate-700 ring-slate-200/80",
  sky: "border-sky-200/80 bg-sky-50/70 text-sky-950 ring-sky-200/70",
  emerald: "border-emerald-200/80 bg-emerald-50/60 text-emerald-950 ring-emerald-200/70",
  amber: "border-amber-200/80 bg-amber-50/70 text-amber-950 ring-amber-200/70",
  rose: "border-rose-200/80 bg-rose-50/70 text-rose-950 ring-rose-200/70",
  indigo: "border-indigo-200/80 bg-indigo-50/70 text-indigo-950 ring-indigo-200/70",
  violet: "border-violet-200/80 bg-violet-50/70 text-violet-950 ring-violet-200/70",
  slate: "border-slate-200/90 bg-slate-50 text-slate-700 ring-slate-200/80",
};

type Props = {
  children: ReactNode;
  variant?: AdminBadgeVariant;
  className?: string;
  title?: string;
};

export function AdminBadge({ children, variant = "neutral", className = "", title }: Props) {
  return (
    <span className={`${adminBadgeBaseCls} ${VARIANT_CLS[variant]} ${className}`.trim()} title={title}>
      {children}
    </span>
  );
}

type RemovableProps = {
  children: ReactNode;
  href: string;
  variant?: AdminBadgeVariant;
  className?: string;
  removeLabel?: string;
};

/** Filter chip that removes itself via navigation. */
export function AdminRemovableBadge({
  children,
  href,
  variant = "neutral",
  className = "",
  removeLabel = "Remove filter",
}: RemovableProps) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`${adminBadgeBaseCls} ${VARIANT_CLS[variant]} shadow-sm transition hover:border-sky-300 hover:bg-sky-50 ${className}`.trim()}
      title={removeLabel}
    >
      {children} <span className="font-bold text-slate-500">×</span>
    </Link>
  );
}
