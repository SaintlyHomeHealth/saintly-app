"use client";

import { memo, useMemo, useState } from "react";

import {
  type OnboardingStepRecord,
  type UnifiedOnboardingSnapshot,
} from "@/lib/onboarding/unified-onboarding-state";

type ChipId = "all" | "missing" | "blocked" | "needs_review" | "complete";

function stepMatchesChip(step: OnboardingStepRecord, chip: ChipId): boolean {
  if (chip === "all") return true;
  if (chip === "complete") return step.status === "complete";
  if (chip === "missing") {
    return step.status === "not_started" || step.displayStatus === "Missing";
  }
  if (chip === "blocked") return step.blocking;
  if (chip === "needs_review") {
    return (
      step.status === "needs_review" ||
      step.status === "invalid" ||
      step.displayStatus === "Needs review"
    );
  }
  return true;
}

const ChecklistRow = memo(function ChecklistRow({ s }: { s: OnboardingStepRecord }) {
  return (
    <tr className="border-b border-slate-100">
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
  );
});

type Props = { snapshot: UnifiedOnboardingSnapshot };

/**
 * Heavier checklist (filters, table) — loaded client-side after the summary loads.
 * Rows are memoized to avoid re-rendering the table when sibling UI updates.
 */
function OnboardingChecklistDeferredInner({ snapshot }: Props) {
  const [chips, setChips] = useState<Set<ChipId>>(
    () => new Set<ChipId>(["missing", "blocked", "needs_review"])
  );
  const [hideComplete, setHideComplete] = useState(true);

  const showAllFiltered = chips.has("all") || chips.size === 0;

  const steps = snapshot.steps.filter((s) => s.key !== "file_performance");
  const visibleSteps = useMemo(() => {
    return steps.filter((s) => {
      if (hideComplete && s.status === "complete") return false;
      if (showAllFiltered) return true;
      return Array.from(chips).some((c) => stepMatchesChip(s, c));
    });
  }, [steps, hideComplete, showAllFiltered, chips]);

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Onboarding & file checklist</h2>
          <p className="text-sm text-slate-500">
            Single source: same fields as the portal pipeline + survey packet.
          </p>
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
              <ChecklistRow key={s.key} s={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(OnboardingChecklistDeferredInner);
