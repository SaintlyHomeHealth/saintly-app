/**
 * Shared Tailwind class strings for CRM admin list views (Leads, Patients, Contacts)
 * so row cards, filters, and actions feel consistent.
 */

export const crmListRowHoverCls =
  "hover:z-[1] hover:rounded-xl hover:border-slate-100 hover:bg-slate-50/90 hover:shadow-md hover:shadow-slate-200/60";

export const crmListScrollOuterCls = "overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm";

export const crmFilterBarCls =
  "flex flex-wrap items-end gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm";

export const crmFilterInputCls =
  "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm";

export const crmPrimaryCtaCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md hover:shadow-sky-200/80 sm:text-sm";

/** Contacts directory: search row + summary (stacked on narrow viewports). */
export const crmContactsToolbarCls =
  "flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:justify-between";

/** Base for pill action links (match Leads row actions). */
export const crmActionBtnBase =
  "inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition hover:shadow-md";

export const crmActionBtnSky = `${crmActionBtnBase} border-slate-200 bg-white text-sky-900 hover:border-sky-300 hover:bg-sky-50`;
export const crmActionBtnMuted = `${crmActionBtnBase} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`;
