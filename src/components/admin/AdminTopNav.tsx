"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AdminNavItemResolved } from "@/lib/admin/admin-nav-config";

const shell =
  "sticky top-0 z-40 border-b border-slate-200/80 bg-gradient-to-r from-white via-sky-50/40 to-cyan-50/35 shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset] backdrop-blur-md supports-[backdrop-filter]:bg-white/75";

const pillBase =
  "inline-flex min-h-[2.25rem] items-center justify-center rounded-full px-3.5 py-2 text-[13px] font-semibold leading-none transition duration-200";

const pillIdle =
  "border border-slate-200/90 bg-white/80 text-slate-600 shadow-sm shadow-slate-200/30 hover:border-sky-200 hover:bg-white hover:text-sky-950 hover:shadow-md";

const pillActive =
  "border border-sky-500/30 bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-md shadow-sky-500/20";

const pillDisabled =
  "cursor-not-allowed border border-dashed border-slate-200 bg-slate-50/90 text-slate-400";

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
 * Product-style admin shell: pill nav, Saintly-tinted bar, clear active state. Role logic stays in `buildAdminNavItems`.
 */
export function AdminTopNav({ items }: AdminTopNavProps) {
  const pathname = usePathname() ?? "";

  if (items.length === 0) return null;

  return (
    <header className={shell}>
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" aria-label="Admin">
          {items.map((item) => {
            const active = navItemIsActive(pathname, item);
            return (
              <span key={item.id} className="contents">
                {item.disabled ? (
                  <span className={`${pillBase} ${pillDisabled}`} title={item.disabledReason}>
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className={`${pillBase} ${active ? pillActive : pillIdle}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </header>
  );
}
