"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  type OnboardingStepRecord,
  type UnifiedOnboardingSnapshot,
} from "@/lib/onboarding/unified-onboarding-state";

import { recomputeOnboardingForEmployeeAction } from "./onboarding-employee-actions";

const OVERALL_LABEL: Record<UnifiedOnboardingSnapshot["overallStatus"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  ready_for_review: "Ready for review",
  complete: "Complete",
};

const OVERALL_BADGE: Record<UnifiedOnboardingSnapshot["overallStatus"], string> = {
  not_started: "border-slate-200 bg-slate-50 text-slate-800",
  in_progress: "border-amber-200 bg-amber-50 text-amber-900",
  blocked: "border-red-200 bg-red-50 text-red-900",
  ready_for_review: "border-violet-200 bg-violet-50 text-violet-900",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

const PREVIEW_START = "/api/admin/employee-onboarding-preview";

type ChipId = "all" | "missing" | "blocked" | "needs_review" | "complete";

type Props = {
  employeeId: string;
  employeeName: string;
  snapshot: UnifiedOnboardingSnapshot;
};

function stepMatchesChip(step: OnboardingStepRecord, chip: ChipId): boolean {
  if (chip === "all") return true;
  if (chip === "complete") return step.status === "complete";
  if (chip === "missing") {
    return step.status === "not_started" || step.displayStatus === "Missing";
  }
  if (chip === "blocked") return step.blocking;
  if (chip === "needs_review") {
    return step.status === "needs_review" || step.status === "invalid" || step.displayStatus === "Sync issue";
  }
  return true;
}

export default function AdminOnboardingCommandCenter({
  employeeId,
  employeeName,
  snapshot,
}: Props) {
  const [chips, setChips] = useState<Set<ChipId>>(
    () => new Set<ChipId>(["missing", "blocked", "needs_review"])
  );
  const [hideComplete, setHideComplete] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recomputeMessage, setRecomputeMessage] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const showAllFiltered = chips.has("all") || chips.size === 0;

  const visibleSteps = useMemo(() => {
    return snapshot.steps.filter((s) => {
      if (hideComplete && s.status === "complete") return false;
      if (showAllFiltered) return true;
      return Array.from(chips).some((c) => stepMatchesChip(s, c));
    });
  }, [snapshot.steps, hideComplete, showAllFiltered, chips]);

  const previewHref = `${PREVIEW_START}?applicantId=${encodeURIComponent(employeeId)}`;

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Onboarding summary
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${OVERALL_BADGE[snapshot.overallStatus]}`}
              >
                {OVERALL_LABEL[snapshot.overallStatus]}
              </span>
              <span className="text-sm font-medium text-slate-600">
                {Math.round(snapshot.percentComplete)}% complete
              </span>
              {snapshot.hasSyncMismatch ? (
                <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  Sync check
                </span>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-slate-500">Last activity (portal)</dt>
                <dd className="text-slate-800">
                  {snapshot.lastActivityAt
                    ? new Date(snapshot.lastActivityAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">Last activity note</dt>
                <dd className="text-slate-800">{snapshot.lastEmployeeActionLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">Admin action required</dt>
                <dd className="font-medium text-slate-900">{snapshot.adminActionRequired ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-500">Pipeline / survey</dt>
                <dd className="text-slate-800">
                  Core pipeline: {snapshot.corePipelineComplete ? "Complete" : "Open"} · Survey
                  file: {snapshot.surveyPacketComplete ? "Complete" : "Open"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
            <a
              href={previewHref}
              className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
            >
              View onboarding as employee
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setRecomputeMessage(null);
                const res = await recomputeOnboardingForEmployeeAction(employeeId);
                setBusy(false);
                if ("message" in res) setRecomputeMessage(res.message);
              }}
              className="inline-flex w-full items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 transition hover:bg-indigo-100 disabled:opacity-50"
            >
              {busy ? "Recomputing…" : "Recompute onboarding status"}
            </button>
            <Link
              href={`/admin/employees/${employeeId}#onboarding-section`}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Card grid (original view)
            </Link>
          </div>
        </div>
        {recomputeMessage ? (
          <p className="mt-3 text-sm text-slate-700" role="status">
            {recomputeMessage}
          </p>
        ) : null}
      </div>

      {/* What’s blocking */}
      <div className="rounded-[24px] border-2 border-red-100 bg-red-50/40 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">What is blocking completion?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Required items where status is not <span className="font-medium">complete</span> (
          {snapshot.blockingSteps.length}).
        </p>
        {snapshot.blockingSteps.length === 0 ? (
          <p className="mt-4 text-sm font-medium text-emerald-800">No blocking items. You’re all set here.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {snapshot.blockingSteps.map((s) => (
              <li
                key={s.key}
                className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{s.label}</p>
                    <p className="text-xs text-slate-500">{s.category}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      <span className="font-medium">Status:</span> {s.displayStatus}
                    </p>
                    {s.whyBlocking ? (
                      <p className="mt-1 text-sm text-red-800">
                        <span className="font-medium">Why it blocks:</span> {s.whyBlocking}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium">Tell the employee:</span> {s.adminCoaching}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.employeeViewHref ? (
                      <a
                        href={s.employeeViewHref}
                        className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open employee step
                      </a>
                    ) : null}
                    <a
                      href={s.adminViewHref}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      View (admin)
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Full checklist with chips */}
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Onboarding & file checklist</h2>
            <p className="text-sm text-slate-500">Single source: same fields as the portal pipeline + survey packet.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hideComplete}
              onChange={(e) => setHideComplete(e.target.checked)}
            />
            Hide complete rows
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["missing", "Missing"],
              ["blocked", "Blocked"],
              ["needs_review", "Needs review"],
              ["complete", "Complete"],
            ] as [ChipId, string][]
          ).map(([id, label]) => {
            const on = id === "all" ? showAllFiltered : chips.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setChips((prev) => {
                    const next = new Set(prev);
                    if (id === "all") {
                      return new Set<ChipId>(["all"]);
                    }
                    next.delete("all" as ChipId);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    if (next.size === 0) return new Set<ChipId>(["all"]);
                    return next;
                  });
                }}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  on
                    ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Step</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Blocking</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleSteps.map((s) => (
                <tr key={s.key} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-900">{s.label}</td>
                  <td className="py-3 pr-4 text-slate-600">{s.category}</td>
                  <td className="py-3 pr-4 text-slate-800">{s.displayStatus}</td>
                  <td className="py-3 pr-4">{s.blocking ? "Yes" : "—"}</td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-2">
                      {s.employeeViewHref ? (
                        <a
                          href={s.employeeViewHref}
                          className="text-xs font-semibold text-sky-700 underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View this step
                        </a>
                      ) : null}
                      <a href={s.adminViewHref} className="text-xs font-semibold text-slate-700 underline">
                        Admin
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin diagnostics */}
      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
        <button
          type="button"
          onClick={() => setShowDebug((v) => !v)}
          className="text-sm font-semibold text-slate-900 underline"
        >
          {showDebug ? "Hide" : "Show"} internal diagnostics
        </button>
        {showDebug ? (
          <div className="mt-3 space-y-2 text-sm text-slate-800">
            <p>
              <span className="font-medium">Why not marked complete on the server?</span> The row in{" "}
              <code className="rounded bg-slate-200 px-1">onboarding_status</code> (percent, flow, completed
              at) is derived from the four core checks in{" "}
              <code className="rounded bg-slate-200 px-1">sync-progress.ts</code> and{" "}
              <code className="rounded bg-slate-200 px-1">derive-progress.ts</code>. Stale data → run
              recompute.
            </p>
            <ul className="list-inside list-disc text-slate-700">
              {snapshot.steps.map((s) => (
                <li key={s.key}>
                  <span className="font-mono text-xs">{s.key}</span> — {s.displayStatus} · counts to pipeline:{" "}
                  {s.countsTowardPipelineComplete ? "yes" : "no"} · {s.failureReason || "ok"}
                </li>
              ))}
            </ul>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify({ employeeId, employeeName, snapshot: snapshot }, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
