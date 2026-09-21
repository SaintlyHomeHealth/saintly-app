/** Fax Center class tokens — map to CSS variables in globals.css. */
export const fx = {
  page: "fax-center min-h-full",
  card: "rounded-[12px] border bg-[var(--fx-surface)] [border-color:var(--fx-border)]",
  chip: "inline-flex items-center rounded-[8px] border px-2 py-0.5 text-[12px] font-semibold tabular-nums [border-color:var(--fx-border)]",
  chipAccent:
    "inline-flex items-center rounded-[8px] bg-[var(--fx-accent)] px-2 py-0.5 text-[12px] font-semibold text-[var(--fx-accent-fg)]",
  chipWarn:
    "inline-flex items-center rounded-[8px] border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  chipDanger:
    "inline-flex items-center rounded-[8px] border border-rose-300/80 bg-rose-50 px-2 py-0.5 text-[12px] font-semibold text-rose-800",
  chipSuccess:
    "inline-flex items-center rounded-[8px] border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-800",
  chipMuted:
    "inline-flex items-center rounded-[8px] border px-2 py-0.5 text-[12px] font-medium text-[var(--fx-text-muted)] [border-color:var(--fx-border)]",
  btnPrimary:
    "inline-flex items-center justify-center rounded-[8px] bg-[var(--fx-accent)] px-3 py-1.5 text-[13px] font-semibold text-[var(--fx-accent-fg)] transition duration-150 ease-out hover:opacity-90 disabled:opacity-50",
  btnSecondary:
    "inline-flex items-center justify-center rounded-[8px] border bg-[var(--fx-surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--fx-text)] transition duration-150 ease-out hover:bg-slate-50 disabled:opacity-50 [border-color:var(--fx-border)]",
  btnGhost:
    "inline-flex items-center justify-center rounded-[8px] px-2.5 py-1.5 text-[13px] font-semibold text-[var(--fx-text-muted)] transition duration-150 ease-out hover:bg-slate-100 disabled:opacity-50",
  btnDanger:
    "inline-flex items-center justify-center rounded-[8px] border border-rose-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-rose-800 hover:bg-rose-50",
  input:
    "w-full rounded-[8px] border bg-[var(--fx-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fx-text)] [border-color:var(--fx-border)]",
  muted: "text-[13px] text-[var(--fx-text-muted)]",
  num: "tabular-nums",
} as const;
