"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { AdminNavItemId, AdminNavItemResolved } from "@/lib/admin/admin-nav-config";

const GlobalSearchBar = dynamic(
  () => import("@/components/admin/GlobalSearchBar").then((m) => m.GlobalSearchBar),
  {
    ssr: false,
    loading: () => (
      <div
        className="relative z-50 h-8 w-full min-w-[10rem] max-w-xs flex-1 rounded-[8px] border border-slate-200/90 bg-slate-50/90 sm:w-56 sm:flex-none"
        aria-hidden
      />
    ),
  }
);

const PRIMARY_IDS: AdminNavItemId[] = [
  "command_center",
  "fax_center",
  "patients",
  "leads",
  "contacts",
  "crm_tasks",
];

const GROUPS: { id: string; label: string; ids: AdminNavItemId[] }[] = [
  {
    id: "operations",
    label: "Operations",
    ids: ["dispatch", "employees", "payroll", "private_pay", "facilities", "recruiting", "pt_cold_calling"],
  },
  {
    id: "clinical",
    label: "Clinical",
    ids: ["credentialing", "pdf_sign"],
  },
  {
    id: "comms",
    label: "Comms",
    ids: ["email_marketing", "call_log", "workspace_keypad", "sales_agent_chat", "phone_numbers"],
  },
  {
    id: "admin",
    label: "Admin",
    ids: ["staff_access"],
  },
];

const shell =
  "sticky top-0 z-40 border-b border-[color:var(--fx-border)] bg-[color:var(--fx-surface)]/95 backdrop-blur-md";

const pillBase =
  "inline-flex min-h-8 items-center justify-center rounded-[8px] px-2.5 py-1 text-[13px] font-semibold leading-none transition duration-150 ease-out";

const pillIdle = "text-[color:var(--fx-text-muted)] hover:bg-slate-100 hover:text-[color:var(--fx-text)]";
const pillActive = "bg-slate-900 text-white";
const pillDisabled = "cursor-not-allowed text-slate-400";

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

  if (item.id === "workspace_keypad") {
    return pathname.startsWith("/workspace/phone/keypad");
  }

  if (item.id === "patients" && item.href.startsWith("/workspace/phone/patients")) {
    return pathname.startsWith("/workspace/phone/patients");
  }

  const h = item.href.replace(/\/$/, "");
  const p = pathname.replace(/\/$/, "");
  if (p === h) return true;
  return p.startsWith(`${h}/`);
}

function isFaxDetail(pathname: string): boolean {
  return /^\/admin\/fax\/[0-9a-f-]{16,}/i.test(pathname);
}

type AdminTopNavProps = {
  items: AdminNavItemResolved[];
};

export function AdminTopNav({ items }: AdminTopNavProps) {
  const pathname = usePathname() ?? "";
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("admin-nav-more");
    if (stored === "1") setMoreOpen(true);
    const savedTheme = window.localStorage.getItem("admin-theme");
    const initial =
      savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function persistMore(next: boolean) {
    setMoreOpen(next);
    window.localStorage.setItem("admin-nav-more", next ? "1" : "0");
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("admin-theme", next);
  }

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const primary = PRIMARY_IDS.map((id) => byId.get(id)).filter(Boolean) as AdminNavItemResolved[];
  const grouped = GROUPS.map((g) => ({
    ...g,
    items: g.ids.map((id) => byId.get(id)).filter(Boolean) as AdminNavItemResolved[],
  })).filter((g) => g.items.length > 0);

  const leftover = items.filter(
    (item) => !PRIMARY_IDS.includes(item.id) && !GROUPS.some((g) => g.ids.includes(item.id))
  );
  if (leftover.length > 0) {
    grouped.push({ id: "more", label: "More", ids: leftover.map((i) => i.id), items: leftover });
  }

  if (items.length === 0) return null;

  const compact = isFaxDetail(pathname);

  return (
    <header className={`${shell} overflow-visible`}>
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-1.5 sm:px-4">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5" aria-label="Admin">
          {primary.map((item) => {
            const active = navItemIsActive(pathname, item);
            return item.disabled ? (
              <span key={item.id} className={`${pillBase} ${pillDisabled}`} title={item.disabledReason}>
                {item.label}
              </span>
            ) : (
              <Link
                key={item.id}
                href={item.href}
                className={`${pillBase} ${active ? pillActive : pillIdle}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          {grouped.length > 0 && !compact ? (
            <div className="relative">
              <button
                type="button"
                className={`${pillBase} ${moreOpen ? pillActive : pillIdle}`}
                aria-expanded={moreOpen}
                onClick={() => persistMore(!moreOpen)}
              >
                More ▾
              </button>
              {moreOpen ? (
                <div className="absolute left-0 top-full z-50 mt-1 w-[18rem] rounded-[12px] border border-[color:var(--fx-border)] bg-[color:var(--fx-surface)] p-2 shadow-lg">
                  {grouped.map((group) => (
                    <div key={group.id} className="mb-2 last:mb-0">
                      <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {group.label}
                      </p>
                      <div className="flex flex-col">
                        {group.items.map((item) =>
                          item.disabled ? (
                            <span
                              key={item.id}
                              className="rounded-[8px] px-2 py-1.5 text-[13px] text-slate-400"
                              title={item.disabledReason}
                            >
                              {item.label}
                            </span>
                          ) : (
                            <Link
                              key={item.id}
                              href={item.href}
                              className={`rounded-[8px] px-2 py-1.5 text-[13px] font-semibold ${
                                navItemIsActive(pathname, item)
                                  ? "bg-slate-900 text-white"
                                  : "text-[color:var(--fx-text)] hover:bg-slate-100"
                              }`}
                              onClick={() => persistMore(false)}
                            >
                              {item.label}
                            </Link>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>
        {compact ? null : <GlobalSearchBar variant="header" />}
        <button
          type="button"
          className={`${pillBase} ${pillIdle}`}
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </header>
  );
}
