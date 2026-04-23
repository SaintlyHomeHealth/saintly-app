"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

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

const PREVIEW_START = "/api/admin/employee-onboarding-preview";

type Props = {
  employeeId: string;
  employeeName: string;
  snapshot: UnifiedOnboardingSnapshot;
};

/**
 * Secondary tooling: preview, recompute, expandable checklist/diagnostics.
 * Blocking items render in the page-level Action required table only.
 */
export default function AdminOnboardingCommandCenter({ employeeId, employeeName, snapshot }: Props) {
  const [busy, setBusy] = useState(false);
  const [recomputeMessage, setRecomputeMessage] = useState<string | null>(null);

  const previewHref = `${PREVIEW_START}?applicantId=${encodeURIComponent(employeeId)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Onboarding tools
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={previewHref}
            className="inline-flex items-center justify-center rounded border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-900 transition hover:bg-sky-100"
          >
            View as employee
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
            className="inline-flex items-center justify-center rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-900 transition hover:bg-indigo-100 disabled:opacity-50"
          >
            {busy ? "Recomputing…" : "Recompute status"}
          </button>
          <Link
            href={`/admin/employees/${employeeId}#onboarding-section`}
            className="inline-flex items-center justify-center rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Jump to pipeline
          </Link>
        </div>
      </div>
      {recomputeMessage ? (
        <p className="text-xs text-slate-700" role="status">
          {recomputeMessage}
        </p>
      ) : null}

      <OnboardingChecklistDeferred snapshot={snapshot} />
      <OnboardingDiagnosticsDeferred
        employeeId={employeeId}
        employeeName={employeeName}
        snapshot={snapshot}
      />
    </div>
  );
}
