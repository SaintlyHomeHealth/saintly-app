"use client";

export const emUi = {
  card: "overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-sm",
  sectionTitle: "text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500",
  label: "text-[11px] font-semibold text-slate-700",
  input:
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60",
  textarea:
    "w-full min-h-[9rem] resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60",
  select:
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60",
  btnGhost:
    "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50",
  btnSecondary:
    "inline-flex items-center justify-center rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50",
  btnPrimary:
    "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-200/50 transition hover:-translate-y-px hover:shadow-lg disabled:translate-y-0 disabled:opacity-50",
  btnSend:
    "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200/50 transition hover:-translate-y-px hover:shadow-lg disabled:translate-y-0 disabled:opacity-50",
  alertWarn: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950",
  alertError: "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900",
  alertOk: "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900",
  tab:
    "rounded-[20px] border px-4 py-2 text-sm font-semibold transition",
  tabActive: "border-sky-300 bg-sky-50 text-sky-900 shadow-sm",
  tabIdle: "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/40",
  pill: "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800",
  pillMuted:
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600",
} as const;

export type EmailMarketingTab =
  | "inbox"
  | "composer"
  | "templates"
  | "flyers"
  | "history"
  | "settings";

export const EMAIL_MARKETING_TABS: { id: EmailMarketingTab; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "composer", label: "Composer" },
  { id: "templates", label: "Templates" },
  { id: "flyers", label: "Flyers" },
  { id: "history", label: "Sent / Drafts" },
  { id: "settings", label: "Settings" },
];
