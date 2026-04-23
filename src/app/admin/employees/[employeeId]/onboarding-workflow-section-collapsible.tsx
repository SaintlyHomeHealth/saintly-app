"use client";

import { useState, type ReactNode } from "react";

type Props = {
  id?: string;
  title: string;
  subtitle: string;
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
  defaultCollapsed,
  children,
}: Props) {
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <section
      id={id}
      className="min-w-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex w-fit items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
        >
          {open ? "Collapse" : "Expand"} section
        </button>
      </div>

      {open ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
