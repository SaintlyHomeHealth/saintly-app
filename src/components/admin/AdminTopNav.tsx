"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AdminNavItemResolved } from "@/lib/admin/admin-nav-config";

const linkBase = "whitespace-nowrap underline-offset-2 transition hover:underline";
const linkActive = "font-bold text-slate-900";
const linkIdle = "font-semibold text-sky-800";
const disabledCls = "cursor-not-allowed font-semibold text-slate-400";

function navItemIsActive(pathname: string, item: AdminNavItemResolved): boolean {
  if (item.disabled) return false;

  if (item.id === "command_center") {
    return pathname === "/admin" || pathname === "/admin/";
  }

  if (item.id === "call_log") {
    if (item.href.startsWith("/admin/phone")) {
      if (pathname.startsWith("/admin/phone/messages")) return false;
      return pathname === "/admin/phone" || pathname.startsWith("/admin/phone/");
    }
    if (item.href.startsWith("/workspace/phone")) {
      if (pathname.startsWith("/workspace/phone/patients")) return false;
      if (pathname.startsWith("/workspace/phone/keypad")) return false;
      return pathname === "/workspace/phone" || pathname.startsWith("/workspace/phone/");
    }
    return false;
  }

  if (item.id === "patients" && item.href.startsWith("/workspace/phone/patients")) {
    return pathname.startsWith("/workspace/phone/patients");
  }

  const h = item.href.replace(/\/$/, "");
  const p = pathname.replace(/\/$/, "");
  if (p === h) return true;
  return p.startsWith(`${h}/`);
}

type AdminTopNavProps = {
  items: AdminNavItemResolved[];
};

/**
 * Shared top navigation for `/admin/*` (and fed the same model from the server for role-aware hrefs).
 */
export function AdminTopNav({ items }: AdminTopNavProps) {
  const pathname = usePathname() ?? "";

  if (items.length === 0) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:px-6">
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm" aria-label="Admin">
        {items.map((item, i) => (
          <span key={item.id} className="flex flex-wrap items-center gap-x-2">
            {i > 0 ? <span className="hidden text-slate-300 sm:inline" aria-hidden>|</span> : null}
            {item.disabled ? (
              <span className={disabledCls} title={item.disabledReason}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className={`${linkBase} ${navItemIsActive(pathname, item) ? linkActive : linkIdle}`}
              >
                {item.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
