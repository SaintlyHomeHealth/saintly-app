"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { memo, useState } from "react";

import { type UnifiedOnboardingSnapshot } from "@/lib/onboarding/unified-onboarding-state";

import { recomputeOnboardingForEmployeeAction } from "./onboarding-employee-actions";
import {
  OnboardingChecklistSkeleton,
  OnboardingDiagnosticsSkeleton,
} from "./onboarding-deferred-skeletons";

const OnboardingChecklistDeferred = dynamic(() => import("./onboarding-checklist-deferred"), {
  ssr: false,
  loading: () => <OnboardingChecklistSkeleton />,
});

const OnboardingDiagnosticsDeferred = dynamic(() => import("./onboarding-diagnostics-deferred"), {
  ssr: false,
  loading: () => <OnboardingDiagnosticsSkeleton />,
});

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

type Props = {
  employeeId: string;
  employeeName: string;
  snapshot: UnifiedOnboardingSnapshot;
};

const BlockingStepCard = memo(function BlockingStepCard({
  s,
}: {
  s: UnifiedOnboardingSnapshot["blockingSteps"][number];
}) {
  return (
    <li className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
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
  );
});

/**
 * Critical path: summary + blocking list (server-friendly, small client bundle).
 * Checklist + diagnostics load in separate client chunks after first paint.
 */
export default function AdminOnboardingCommandCenter({ employeeId, employeeName, snapshot }: Props) {
  const [busy, setBusy] = useState(false);
  const [recomputeMessage, setRecomputeMessage] = useState<string | null>(null);

  const previewHref = `${PREVIEW_START}?applicantId=${encodeURIComponent(employeeId)}`;

  return (
    <div className="space-y-5">
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
                  Core pipeline: {snapshot.corePipelineComplete ? "Complete" : "Open"} · Survey file:{" "}
                  {snapshot.surveyPacketComplete ? "Complete" : "Open"}
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
              <BlockingStepCard key={s.key} s={s} />
            ))}
          </ul>
        )}
      </div>

      <OnboardingChecklistDeferred snapshot={snapshot} />
      <OnboardingDiagnosticsDeferred
        employeeId={employeeId}
        employeeName={employeeName}
        snapshot={snapshot}
      />
    </div>
  );
}
