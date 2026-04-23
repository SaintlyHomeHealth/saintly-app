"use client";

import Link from "next/link";
import { Fragment, useCallback, useState } from "react";

export type ComplianceProgramHistoryEntry = {
  id: string;
  versionNumber: number;
  createdAtDisplay: string;
  statusLabel: string;
  statusBadgeClass: string;
  isCurrent: boolean;
  viewHref: string;
  printHref: string | null;
};

export type ComplianceProgramStatusRow = {
  rowKey: string;
  sectionId?: string;
  program: string;
  subtitle?: string;
  currentRecord: string;
  statusLabel: string;
  statusBadgeClass: string;
  dueDateDisplay: string;
  primaryHref: string;
  primaryLabel: string;
  printHref?: string | null;
  printLabel?: string;
  startNewVersionHref?: string | null;
  progressPercent?: number | null;
  progressTotal?: number | null;
  description?: string;
  history?: ComplianceProgramHistoryEntry[];
  showDetails: boolean;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className="inline-block text-slate-400 transition-transform"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
      aria-hidden
    >
      ›
    </span>
  );
}

export default function ComplianceProgramStatusTable({ rows }: { rows: ComplianceProgramStatusRow[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = useCallback((key: string) => {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }, []);

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-2 py-1.5 pl-3 font-semibold">Program</th>
            <th className="px-2 py-1.5 font-semibold">Current record</th>
            <th className="px-2 py-1.5 font-semibold">Status</th>
            <th className="whitespace-nowrap px-2 py-1.5 font-semibold">Due</th>
            <th className="px-2 py-1.5 pr-3 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const isOpen = Boolean(open[r.rowKey]);
            return (
              <Fragment key={r.rowKey}>
                <tr id={r.sectionId} className="scroll-mt-24 align-top bg-white">
                  <td className="max-w-[200px] px-2 py-1.5 pl-3">
                    <div className="font-semibold text-slate-900">{r.program}</div>
                    {r.subtitle ? (
                      <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{r.subtitle}</div>
                    ) : null}
                  </td>
                  <td className="min-w-0 max-w-xs px-2 py-1.5 text-slate-700 [overflow-wrap:anywhere]">
                    {r.currentRecord}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${r.statusBadgeClass}`}
                    >
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{r.dueDateDisplay}</td>
                  <td className="px-2 py-1.5 pr-3">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {r.showDetails ? (
                        <button
                          type="button"
                          onClick={() => toggle(r.rowKey)}
                          className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          aria-expanded={isOpen}
                        >
                          <Chevron open={isOpen} />
                          Details
                        </button>
                      ) : null}
                      <Link
                        href={r.primaryHref}
                        className="inline-flex rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                      >
                        {r.primaryLabel}
                      </Link>
                      {r.printHref && r.printLabel ? (
                        <Link
                          href={r.printHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {r.printLabel}
                        </Link>
                      ) : null}
                      {r.startNewVersionHref ? (
                        <Link
                          href={r.startNewVersionHref}
                          className="inline-flex rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100"
                        >
                          New version
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {r.showDetails && isOpen ? (
                  <tr className="bg-slate-50/80">
                    <td colSpan={5} className="px-3 py-2 text-xs text-slate-700">
                      {r.description ? (
                        <p className="leading-relaxed text-slate-600">{r.description}</p>
                      ) : null}
                      {typeof r.progressPercent === "number" &&
                      r.progressTotal &&
                      r.progressTotal > 0 ? (
                        <div className={r.description ? "mt-2" : ""}>
                          <div className="mb-0.5 flex justify-between text-[11px] font-medium text-slate-500">
                            <span>Form progress</span>
                            <span>{r.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-sky-500"
                              style={{ width: `${r.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                      {r.history && r.history.length > 0 ? (
                        <div className={r.description || r.progressPercent ? "mt-3" : ""}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Version history
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {r.history.map((h) => (
                              <li
                                key={h.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200/80 bg-white px-2 py-1"
                              >
                                <div className="min-w-0">
                                  <span className="font-medium text-slate-800">v{h.versionNumber}</span>
                                  <span className="mx-1.5 text-slate-400">·</span>
                                  <span className="text-slate-600">{h.createdAtDisplay}</span>
                                  <span
                                    className={`ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${h.statusBadgeClass}`}
                                  >
                                    {h.statusLabel}
                                  </span>
                                  {h.isCurrent ? (
                                    <span className="ml-1 text-[10px] font-semibold text-sky-700">current</span>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <Link
                                    href={h.viewHref}
                                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    Open
                                  </Link>
                                  {h.printHref ? (
                                    <Link
                                      href={h.printHref}
                                      className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
                                    >
                                      Print
                                    </Link>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
