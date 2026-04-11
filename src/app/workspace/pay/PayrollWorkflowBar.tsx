"use client";

import { ActiveVisitCard } from "./ActiveVisitCard";
import { StartVisitDialog } from "./StartVisitDialog";
import { SubmitWeeklyPayrollButton } from "./SubmitWeeklyPayrollButton";

export function PayrollWorkflowBar({
  activeVisit,
  assignablePatients,
  deadlinePassed,
  eligibleCount,
  eligibleTotalLabel,
  submitDisabledReason,
}: {
  activeVisit: { id: string; patientName: string; visitType: string; checkInIso: string } | null;
  assignablePatients: { id: string; label: string }[];
  deadlinePassed: boolean;
  eligibleCount: number;
  eligibleTotalLabel: string;
  submitDisabledReason: string | null;
}) {
  const canSubmit = eligibleCount > 0 && !deadlinePassed;

  return (
    <div className="space-y-4">
      {activeVisit ? (
        <ActiveVisitCard
          visitId={activeVisit.id}
          patientName={activeVisit.patientName}
          visitType={activeVisit.visitType}
          checkInIso={activeVisit.checkInIso}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/70 px-4 py-5 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-900">No active visit</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Clock in when you arrive at the home. Saintly uses your check-in and check-out to build payroll.
          </p>
          {assignablePatients.length === 0 ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950">
              No patients are assigned to you yet. Ask dispatch to assign patients before starting a visit here.
            </p>
          ) : null}
          <div className="mt-4 flex justify-center">
            <StartVisitDialog assignablePatients={assignablePatients} />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-sky-100/90 bg-white/80 px-4 py-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-900/70">Weekly payroll</p>
        <p className="mt-1 text-xs text-slate-600">
          {activeVisit
            ? "End your visit first if you are still on site. Submit when lines are ready for this pay period."
            : canSubmit
              ? "Submit visits that are ready for this Monday–Sunday window before the Tuesday deadline."
              : "When visits are complete and payroll lines are ready, submit them here."}
        </p>
        <div className="mt-3">
          <SubmitWeeklyPayrollButton
            disabled={!canSubmit}
            eligibleCount={eligibleCount}
            eligibleTotalLabel={eligibleTotalLabel}
            disabledReason={submitDisabledReason}
          />
        </div>
      </div>
    </div>
  );
}
