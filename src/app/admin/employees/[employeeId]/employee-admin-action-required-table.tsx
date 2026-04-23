import type {
  OnboardingStepRecord,
  UnifiedOnboardingSnapshot,
} from "@/lib/onboarding/unified-onboarding-state";

type BlockingStep = UnifiedOnboardingSnapshot["blockingSteps"][number];

/** 0 = blocks completion (red), 1 = review / in-flight (amber), 2 = informational (neutral) */
function getSeverityTier(s: OnboardingStepRecord): 0 | 1 | 2 {
  if (!s.blocking) return 2;
  if (s.status === "not_started" || s.status === "invalid") return 0;
  if (
    s.status === "needs_review" ||
    s.status === "in_progress" ||
    s.status === "submitted"
  ) {
    return 1;
  }
  return 1;
}

const TIER_ROW: Record<0 | 1 | 2, string> = {
  0: "border-l-[3px] border-l-red-500 bg-red-50/40",
  1: "border-l-[3px] border-l-amber-400 bg-amber-50/35",
  2: "border-l-[3px] border-l-slate-300 bg-slate-50/50",
};

const TIER_STATUS: Record<0 | 1 | 2, string> = {
  0: "font-medium text-red-900",
  1: "font-medium text-amber-950",
  2: "text-slate-700",
};

function getAdminActionLabel(s: OnboardingStepRecord): string {
  if (s.status === "submitted") return "Review";

  switch (s.key) {
    case "system_sync":
    case "pipeline_application":
      return "Review";
    case "credential_bundle":
      return "Replace";
    case "pipeline_documents":
    case "file_tb":
    case "file_background":
      return s.status === "in_progress" ? "Replace" : "Open";
    case "file_oig":
      return "Complete";
    case "pipeline_contracts_tax":
    case "pipeline_training":
      return "Open";
    case "file_skills":
    case "file_performance":
      return s.status === "needs_review" ? "Review" : "Open";
    default:
      return "Open";
  }
}

function sortBlockingSteps(steps: BlockingStep[]): BlockingStep[] {
  return [...steps].sort((a, b) => {
    const t = getSeverityTier(a) - getSeverityTier(b);
    if (t !== 0) return t;
    return a.key.localeCompare(b.key);
  });
}

const actionLinkClass =
  "inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold transition hover:opacity-90";

export default function EmployeeAdminActionRequiredTable({ steps }: { steps: BlockingStep[] }) {
  if (steps.length === 0) {
    return (
      <section
        className="border-b border-slate-200 border-l-4 border-l-emerald-500 bg-white px-3 py-3 sm:px-4"
        aria-label="Action required"
      >
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">Action required</h2>
        <p className="mt-1 text-sm text-slate-600">Nothing needs attention — onboarding path is clear.</p>
      </section>
    );
  }

  const sorted = sortBlockingSteps(steps);
  const counts = sorted.reduce(
    (acc, s) => {
      acc[getSeverityTier(s)] += 1;
      return acc;
    },
    { 0: 0, 1: 0, 2: 0 } as Record<0 | 1 | 2, number>
  );

  return (
    <section
      className="border-b-2 border-slate-200 border-l-4 border-l-rose-600 bg-white px-3 py-3 shadow-sm sm:px-4"
      aria-label="Action required"
    >
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-900">Action required</h2>
        <p className="text-[11px] font-medium text-slate-500">
          {counts[0] > 0 ? (
            <span className="text-red-800">{counts[0]} blocker{counts[0] === 1 ? "" : "s"}</span>
          ) : null}
          {counts[0] > 0 && (counts[1] > 0 || counts[2] > 0) ? <span className="text-slate-400"> · </span> : null}
          {counts[1] > 0 ? (
            <span className="text-amber-900">{counts[1]} review / in progress</span>
          ) : null}
          {counts[1] > 0 && counts[2] > 0 ? <span className="text-slate-400"> · </span> : null}
          {counts[2] > 0 ? <span className="text-slate-600">{counts[2]} follow-up</span> : null}
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Sorted: completion blockers first, then review and in-flight work, then other follow-ups.
      </p>
      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <th className="py-2 pl-3 pr-3 font-semibold">Item</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Why it matters</th>
              <th className="py-2 pr-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const tier = getSeverityTier(s);
              const why = s.whyBlocking?.trim() || s.adminCoaching?.trim() || "—";
              const adminLabel = getAdminActionLabel(s);
              const adminBtnClass =
                tier === 0
                  ? "border-red-200 bg-white text-red-900 hover:bg-red-50"
                  : tier === 1
                    ? "border-amber-200 bg-white text-amber-950 hover:bg-amber-50/80"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50";

              return (
                <tr key={s.key} className={`${TIER_ROW[tier]} align-top`}>
                  <td className="py-2.5 pl-3 pr-3 font-semibold text-slate-900">{s.label}</td>
                  <td className={`py-2.5 pr-3 text-sm ${TIER_STATUS[tier]}`}>{s.displayStatus}</td>
                  <td className="max-w-md py-2.5 pr-3 text-xs leading-snug text-slate-700">{why}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {s.employeeViewHref ? (
                        <a
                          href={s.employeeViewHref}
                          className={`${actionLinkClass} border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Complete
                        </a>
                      ) : null}
                      <a
                        href={s.adminViewHref}
                        className={`${actionLinkClass} ${adminBtnClass}`}
                      >
                        {adminLabel}
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
