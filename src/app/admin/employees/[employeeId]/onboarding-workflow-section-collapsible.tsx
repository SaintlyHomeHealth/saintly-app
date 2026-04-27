"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  id?: string;
  title: string;
  subtitle: string;
  /**
   * If the URL has `?tab=` and it matches one of these values, expand on mount
   * (employee detail work-area tabs from `employee-detail-work-areas.ts`).
   */
  expandWhenTab?: string[] | null;
  /** When true, the section body starts collapsed to reduce initial DOM. */
  defaultCollapsed: boolean;
  children: ReactNode;
};

/**
 * Reduces above-the-fold DOM: completed pipelines often only need the header until expanded.
 */
export default function OnboardingWorkflowSectionCollapsible({
  id,
  title,
  subtitle,
  expandWhenTab,
  defaultCollapsed,
  children,
}: Props) {
  const [open, setOpen] = useState(!defaultCollapsed);

  useEffect(() => {
    if (!expandWhenTab?.length) return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && expandWhenTab.includes(tab)) {
      setOpen(true);
    }
  }, [expandWhenTab]);

  return (
    <section
      id={id}
      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex w-fit items-center justify-center rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
