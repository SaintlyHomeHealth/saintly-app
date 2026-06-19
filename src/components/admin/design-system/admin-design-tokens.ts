/**
 * Shared Tailwind class tokens for Saintly admin pages.
 * Matches the Recruiting workspace: soft sky gradients, rounded cards, pill nav.
 */

export const adminPageBgCls = "min-h-full space-y-6 bg-gradient-to-b from-sky-50/70 via-white to-white p-4 sm:p-6";

export const adminCardCls =
  "rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40 ring-1 ring-slate-100/50";

export const adminCardSoftCls =
  "rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm shadow-slate-200/40";

export const adminFilterCardCls =
  "rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm shadow-slate-200/40";

export const adminFilterLabelCls = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export const adminTableCardCls =
  "overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40 ring-1 ring-slate-100/40";

export const adminTableHeaderCls =
  "hidden border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-sky-50/30 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid";

export const adminTableRowCls =
  "grid grid-cols-1 border-b border-slate-100/90 transition-colors last:border-0 md:items-start";

export const adminTableRowHoverCls =
  "hover:z-[1] hover:border-sky-100/80 hover:bg-sky-50/20 hover:shadow-sm hover:shadow-sky-100/40";

export const adminTabBarCls =
  "flex flex-wrap gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-sm shadow-slate-200/40";

export const adminToolbarCls =
  "flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm shadow-slate-200/40 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between";

export const adminEmptyStateCls =
  "rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-16 text-center shadow-sm";

export const adminBadgeBaseCls =
  "inline-flex max-w-full shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1";

export const adminPaginationBtnCls =
  "inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export const adminSecondaryBtnCls =
  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:text-sm";

export const adminAlertSuccessCls =
  "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm";

export const adminAlertErrorCls =
  "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 shadow-sm";
