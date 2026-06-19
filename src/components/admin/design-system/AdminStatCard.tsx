import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { adminCardCls } from "./admin-design-tokens";

export type AdminStatCardAccent = "slate" | "sky" | "amber" | "indigo" | "violet" | "emerald" | "rose";

const ACCENT: Record<
  AdminStatCardAccent,
  { ring: string; iconWrap: string; value: string }
> = {
  slate: { ring: "ring-slate-100", iconWrap: "bg-slate-100 text-slate-600", value: "text-slate-900" },
  sky: { ring: "ring-sky-100", iconWrap: "bg-sky-100 text-sky-700", value: "text-sky-800" },
  amber: { ring: "ring-amber-100", iconWrap: "bg-amber-100 text-amber-700", value: "text-amber-800" },
  indigo: { ring: "ring-indigo-100", iconWrap: "bg-indigo-100 text-indigo-700", value: "text-indigo-800" },
  violet: { ring: "ring-violet-100", iconWrap: "bg-violet-100 text-violet-700", value: "text-violet-800" },
  emerald: { ring: "ring-emerald-100", iconWrap: "bg-emerald-100 text-emerald-700", value: "text-emerald-800" },
  rose: { ring: "ring-rose-100", iconWrap: "bg-rose-100 text-rose-700", value: "text-rose-800" },
};

type Props = {
  label: string;
  value: number | string;
  accent?: AdminStatCardAccent;
  icon?: LucideIcon;
  emphasize?: boolean;
  hint?: string;
  className?: string;
};

export function AdminStatCard({
  label,
  value,
  accent = "slate",
  icon: Icon,
  emphasize = false,
  hint,
  className = "",
}: Props) {
  const a = ACCENT[accent];

  return (
    <div
      className={`flex items-center gap-3 ${adminCardCls} px-4 py-3.5 transition hover:-translate-y-px hover:shadow-md ${a.ring} ${
        emphasize ? "bg-gradient-to-br from-amber-50/60 to-white" : ""
      } ${className}`.trim()}
    >
      {Icon ? (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.iconWrap}`}>
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-2xl font-bold leading-tight tabular-nums ${a.value}`}>{value}</p>
        {hint ? <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

type GridProps = {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5;
  className?: string;
};

export function AdminStatCardGrid({ children, columns = 4, className = "" }: GridProps) {
  const colCls =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : columns === 5
          ? "sm:grid-cols-2 lg:grid-cols-5"
          : "sm:grid-cols-2 lg:grid-cols-4";

  return <div className={`grid gap-3 ${colCls} ${className}`.trim()}>{children}</div>;
}
