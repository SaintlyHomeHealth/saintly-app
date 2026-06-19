import Link from "next/link";
import type { ReactNode } from "react";

import { adminTabBarCls } from "./admin-design-tokens";

export type AdminTabItem = {
  id: string;
  label: string;
  href: string;
  count?: number;
  active?: boolean;
};

type Props = {
  tabs: AdminTabItem[];
  ariaLabel?: string;
  className?: string;
};

function tabCls(active: boolean): string {
  const base = "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition";
  if (active) {
    return `${base} bg-sky-600 text-white shadow-sm shadow-sky-200/60`;
  }
  return `${base} text-slate-600 hover:bg-sky-50 hover:text-sky-900`;
}

function countBadgeCls(active: boolean): string {
  return `rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
  }`;
}

export function AdminTabs({ tabs, ariaLabel = "Admin tabs", className = "" }: Props) {
  return (
    <nav className={`${adminTabBarCls} ${className}`.trim()} aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={tabCls(Boolean(tab.active))}
          aria-current={tab.active ? "page" : undefined}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span className={countBadgeCls(Boolean(tab.active))}>{tab.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

type SlotProps = {
  children: ReactNode;
  className?: string;
};

/** Slot for custom tab content when links are not appropriate. */
export function AdminTabsBar({ children, className = "" }: SlotProps) {
  return <div className={`${adminTabBarCls} ${className}`.trim()}>{children}</div>;
}
