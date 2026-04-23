"use client";

import { memo, useState } from "react";
import { type UnifiedOnboardingSnapshot } from "@/lib/onboarding/unified-onboarding-state";

type Props = { employeeId: string; employeeName: string; snapshot: UnifiedOnboardingSnapshot };

/**
 * Optional JSON diagnostics — client-only to avoid inflating the critical path.
 */
function OnboardingDiagnosticsDeferredInner({ employeeId, employeeName, snapshot }: Props) {
  const [showDebug, setShowDebug] = useState(false);

  return (
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
                <span className="font-mono text-xs">{s.key}</span> — {s.displayStatus} · counts to
                pipeline: {s.countsTowardPipelineComplete ? "yes" : "no"} · {s.failureReason || "ok"}
              </li>
            ))}
          </ul>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify({ employeeId, employeeName, snapshot: snapshot }, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export default memo(OnboardingDiagnosticsDeferredInner);
