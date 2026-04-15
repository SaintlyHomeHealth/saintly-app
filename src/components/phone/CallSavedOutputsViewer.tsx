"use client";

import { useMemo } from "react";

import { useCallOutputs } from "@/hooks/use-call-outputs";
import type { SavedCallOutputRow } from "@/lib/phone/call-outputs-client";

const SECTIONS = [
  { type: "soap" as const, title: "SOAP" },
  { type: "summary" as const, title: "Call Summary" },
  { type: "intake" as const, title: "Intake Summary" },
];

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function sortNewestFirst(rows: SavedCallOutputRow[]): SavedCallOutputRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function groupByType(outputs: SavedCallOutputRow[]): Record<(typeof SECTIONS)[number]["type"], SavedCallOutputRow[]> {
  const soap: SavedCallOutputRow[] = [];
  const summary: SavedCallOutputRow[] = [];
  const intake: SavedCallOutputRow[] = [];
  for (const row of outputs) {
    if (row.type === "soap") soap.push(row);
    else if (row.type === "summary") summary.push(row);
    else if (row.type === "intake") intake.push(row);
  }
  return {
    soap: sortNewestFirst(soap),
    summary: sortNewestFirst(summary),
    intake: sortNewestFirst(intake),
  };
}

export type CallSavedOutputsViewerProps = {
  /** `phone_calls.id` */
  phoneCallId: string | null | undefined;
  /** Optional heading above the panel */
  heading?: string;
  className?: string;
  /** When true, parent supplies the section title — hide the duplicate heading row (e.g. call detail). */
  embedded?: boolean;
};

/**
 * Read-only list of saved AI outputs for a call (SOAP, summaries).
 * Drop into call detail, CRM drawer, or future lead/patient views.
 */
export function CallSavedOutputsViewer({
  phoneCallId,
  heading = "Saved call outputs",
  className = "",
  embedded = false,
}: CallSavedOutputsViewerProps) {
  const { outputs, loading, error } = useCallOutputs(phoneCallId);

  const grouped = useMemo(() => groupByType(outputs), [outputs]);
  const hasAny =
    grouped.soap.length > 0 || grouped.summary.length > 0 || grouped.intake.length > 0;

  const id = typeof phoneCallId === "string" ? phoneCallId.trim() : "";
  const idle = !id;

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      {!embedded ? (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">{heading}</h2>
          {loading ? (
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Loading…</span>
          ) : null}
        </div>
      ) : loading ? (
        <p className="text-[11px] font-medium text-slate-400">Loading saved outputs…</p>
      ) : null}

      {error ? (
        <div
          className="rounded-2xl border border-rose-200/90 bg-rose-50/90 px-4 py-3 text-sm text-rose-900 shadow-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {idle ? (
        <div className="ws-phone-empty text-[13px] leading-relaxed">
          Select a call to view saved SOAP and summaries.
        </div>
      ) : null}

      {!idle && !loading && !error && !hasAny ? (
        <div className="ws-phone-empty">
          <p className="font-medium text-slate-800">No saved outputs yet</p>
          <p className="mt-1 text-[13px] text-slate-600">
            Saved SOAP notes and summaries from the phone workspace will appear here.
          </p>
        </div>
      ) : null}

      {!idle && hasAny ? (
        <div className={embedded ? "space-y-3" : "space-y-5"}>
          {SECTIONS.map(({ type, title }) => {
            const rows = grouped[type];
            if (rows.length === 0) return null;
            return (
              <section
                key={type}
                className={
                  embedded
                    ? "overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/40 to-white shadow-inner shadow-slate-900/[0.04]"
                    : "ws-phone-card-soft overflow-hidden p-0"
                }
              >
                <div
                  className={
                    embedded
                      ? "border-b border-slate-200/70 bg-white/90 px-4 py-2.5 backdrop-blur-sm"
                      : "border-b border-sky-100/80 bg-gradient-to-r from-white to-sky-50/50 px-4 py-2.5"
                  }
                >
                  <h3
                    className={
                      embedded
                        ? "text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500"
                        : "text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-950/80"
                    }
                  >
                    {title}
                  </h3>
                </div>
                <div className={embedded ? "divide-y divide-slate-200/60" : "divide-y divide-sky-100/70"}>
                  {rows.map((row) => (
                    <article key={row.id} className="px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Saved {formatSavedAt(row.created_at)}
                      </p>
                      <div className="mt-2 max-h-[min(420px,55vh)] overflow-y-auto rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-800 shadow-inner shadow-slate-900/[0.04]">
                        <pre className="whitespace-pre-wrap font-sans">{row.content}</pre>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
