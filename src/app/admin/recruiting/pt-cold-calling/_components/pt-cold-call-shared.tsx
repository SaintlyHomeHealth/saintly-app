"use client";

import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const btnField =
  "inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.98]";
export const btnPrimary = `${btnField} border-transparent bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-sky-200/50`;
export const btnSecondary = `${btnField} border-slate-200 bg-white text-slate-800 hover:border-sky-200 hover:bg-sky-50/60`;

export const chip =
  "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98]";
export const chipActive = `${chip} border-sky-600 bg-sky-600 text-white shadow-sm`;
export const chipIdle = `${chip} border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50`;

export const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-2.5 text-sm font-medium text-slate-800 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200";
export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200";

export const actionBtn =
  "inline-flex min-h-[2.25rem] items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 active:scale-[0.98]";

/** Color-coded status pill matching cold-call workflow stages. */
export function statusBadgeClass(status: string): string {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-bold ring-1";
  switch (status) {
    case "Hired":
    case "Interview Scheduled":
    case "Candidate Identified":
      return `${base} bg-emerald-50 text-emerald-900 ring-emerald-200`;
    case "Interested":
    case "Send Application":
      return `${base} bg-sky-50 text-sky-900 ring-sky-200`;
    case "Call Today":
    case "Follow Up":
      return `${base} bg-amber-50 text-amber-950 ring-amber-200`;
    case "Do Not Call":
    case "Bad Number":
    case "Not Interested":
      return `${base} bg-rose-50 text-rose-900 ring-rose-200`;
    case "Gatekeeper":
    case "Asked for Manager":
    case "Called - No Answer":
    case "Left Voicemail":
      return `${base} bg-slate-100 text-slate-700 ring-slate-200`;
    default:
      return `${base} bg-indigo-50 text-indigo-900 ring-indigo-200`;
  }
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={statusBadgeClass(status)}>{status}</span>;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, "—", { month: "short", day: "numeric", year: "numeric" });
}

export function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Turn a YYYY-MM-DD date-input value into a Phoenix-noon ISO string (safe within the day). */
export function ymdToFollowUpIso(ymd: string): string | null {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return `${t}T12:00:00.000-07:00`;
}

/** ISO timestamp → YYYY-MM-DD (Phoenix) for prefilling a date input. */
export function isoToYmd(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  if (!y || !m || !d) return "";
  return `${y}-${m}-${d}`;
}

export function telHref(phone: string | null | undefined): string | null {
  const p = (phone ?? "").trim();
  if (!p) return null;
  return `tel:${p.replace(/[^\d+]/g, "")}`;
}

export function websiteHref(website: string | null | undefined): string | null {
  const w = (website ?? "").trim();
  if (!w) return null;
  return w.startsWith("http") ? w : `https://${w}`;
}
