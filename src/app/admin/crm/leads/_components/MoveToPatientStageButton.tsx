"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { convertLeadToPatient } from "@/app/admin/phone/actions";

function formatMoveError(code: string): string {
  switch (code) {
    case "already_patient_stage":
    case "already_converted":
      return "Already in Patient stage.";
    case "lead_dead":
      return "This lead is marked dead.";
    case "forbidden":
      return "Not allowed.";
    case "insert_failed":
      return "Could not create or update records.";
    case "update_failed":
      return "Could not update the lead.";
    case "load_failed":
    case "lead_not_found":
      return "Lead not found.";
    default:
      return code || "Something went wrong.";
  }
}

export function MoveToPatientStageButton(props: { leadId: string; className?: string }) {
  const { leadId, className } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onConfirm() {
    setPending(true);
    setErr(null);
    const res = await convertLeadToPatient(leadId);
    setPending(false);
    if (!res.ok) {
      setErr(formatMoveError(res.error));
      return;
    }
    setOpen(false);
    const q = new URLSearchParams({
      crmStageMoved: "1",
      leadId,
      prevStage: res.previousStage,
    });
    router.push(`/admin/crm/patients/${res.patientId}?${q.toString()}`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={
          className ??
          "rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
        }
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
      >
        Move to Patient Stage
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-patient-stage-title"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="move-patient-stage-title" className="text-base font-semibold text-slate-900">
              Move to Patient Stage
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Are you sure you want to move this to Patient? This will make it active in clinical workflows.
            </p>
            {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                onClick={() => void onConfirm()}
              >
                {pending ? "…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
