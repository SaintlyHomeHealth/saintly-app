"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { undoLeadPatientStage } from "@/app/admin/phone/actions";
import type { CrmStage } from "@/lib/crm/crm-stage";
import { normalizeCrmStage } from "@/lib/crm/crm-stage";

export function CrmPatientStageMovedBanner(props: {
  patientId: string;
  movedLeadId: string;
  previousStage: CrmStage;
}) {
  const { patientId, movedLeadId, previousStage } = props;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const prev = previousStage ? normalizeCrmStage(previousStage) : "lead";
  if (dismissed || !movedLeadId || !previousStage || prev === "patient") {
    return null;
  }

  async function onUndo() {
    setPending(true);
    const res = await undoLeadPatientStage(movedLeadId, prev);
    setPending(false);
    if (!res.ok) {
      return;
    }
    setDismissed(true);
    router.replace(`/admin/crm/patients/${patientId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-950">
      <span className="font-medium">Moved to Patient</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
          onClick={onUndo}
        >
          {pending ? "…" : "Undo"}
        </button>
        <button
          type="button"
          className="rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-900/80 hover:underline"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
