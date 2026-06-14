"use client";

import { useEffect, useState } from "react";

import {
  LEAD_INTAKE_DECLINE_REASONS,
  type LeadIntakeDeclineReason,
  type LeadIntakeReadinessReviewRow,
} from "@/lib/crm/lead-intake-readiness-types";

export type LeadIntakeDecisionMode =
  | "request_info"
  | "clinical_review"
  | "payer_review"
  | "staffing_review"
  | "accept"
  | "decline"
  | "hold";

type StaffOption = { user_id: string; label: string };

const inp =
  "mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm";

const COMMON_MISSING = [
  "referral documents",
  "physician order",
  "demographics / face sheet",
  "insurance information",
  "patient contact information",
  "service / discipline requested",
];

type LeadIntakeDecisionModalProps = {
  open: boolean;
  mode: LeadIntakeDecisionMode;
  leadId: string;
  review: LeadIntakeReadinessReviewRow;
  staffOptions?: StaffOption[];
  onClose: () => void;
  onSuccess: (admissionHandoffId?: string | null) => void;
};

export function LeadIntakeDecisionModal({
  open,
  mode,
  leadId,
  review,
  staffOptions = [],
  onClose,
  onSuccess,
}: LeadIntakeDecisionModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [missingItems, setMissingItems] = useState<string[]>(review.missing_items ?? []);
  const [message, setMessage] = useState("");
  const [createTask, setCreateTask] = useState(true);
  const [dueDate, setDueDate] = useState("");

  const [assignTo, setAssignTo] = useState("");
  const [clinicalNote, setClinicalNote] = useState("");

  const [acceptNote, setAcceptNote] = useState("");
  const [intakeOwnerId, setIntakeOwnerId] = useState("");
  const [createSocTask, setCreateSocTask] = useState(false);

  const [declineReason, setDeclineReason] = useState<LeadIntakeDeclineReason>("other");
  const [internalNote, setInternalNote] = useState("");

  const [holdNote, setHoldNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setMissingItems(review.missing_items ?? []);
    setError(null);
  }, [open, review.missing_items]);

  if (!open) return null;

  const titleForMode: Record<LeadIntakeDecisionMode, string> = {
    request_info: "Request missing information",
    clinical_review: "Send to clinical review",
    payer_review: "Send to payer review",
    staffing_review: "Send to staffing review",
    accept: "Accept referral",
    decline: "Decline referral",
    hold: "Hold referral",
  };

  function toggleMissing(item: string) {
    setMissingItems((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      let url = "";
      let body: Record<string, unknown> = {};

      switch (mode) {
        case "request_info":
          if (missingItems.length === 0) {
            setError("Select at least one missing item.");
            return;
          }
          url = `/api/leads/${encodeURIComponent(leadId)}/intake-readiness/request-info`;
          body = {
            missing_items: missingItems,
            message: message.trim() || null,
            create_follow_up_task: createTask,
            due_at: dueDate ? new Date(dueDate).toISOString() : null,
          };
          break;
        case "clinical_review":
          url = `/api/leads/${encodeURIComponent(leadId)}/intake-readiness/clinical-review`;
          body = {
            assign_to: assignTo || null,
            clinical_note: clinicalNote.trim() || null,
            due_at: dueDate ? new Date(dueDate).toISOString() : null,
          };
          break;
        case "payer_review":
        case "staffing_review":
        case "hold":
          url = `/api/leads/${encodeURIComponent(leadId)}/intake-readiness`;
          body = {
            readiness_status:
              mode === "payer_review"
                ? "needs_payer_review"
                : mode === "staffing_review"
                  ? "needs_staffing_review"
                  : "needs_review",
            decision: mode === "hold" ? "hold" : mode,
            notes: holdNote.trim() || null,
            suggested_next_action:
              mode === "payer_review"
                ? "Payer verification in progress."
                : mode === "staffing_review"
                  ? "Staffing review in progress."
                  : "Referral on hold pending review.",
          };
          break;
        case "accept":
          url = `/api/leads/${encodeURIComponent(leadId)}/intake-readiness/accept`;
          body = {
            note: acceptNote.trim() || null,
            intake_owner_id: intakeOwnerId || null,
            create_soc_task: createSocTask,
          };
          break;
        case "decline":
          url = `/api/leads/${encodeURIComponent(leadId)}/intake-readiness/decline`;
          body = {
            decline_reason: declineReason,
            internal_note: internalNote.trim() || null,
          };
          break;
      }

      const method = mode === "payer_review" || mode === "staffing_review" || mode === "hold" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        admission_handoff_id?: string | null;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      onSuccess(mode === "accept" ? data.admission_handoff_id ?? null : undefined);
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-decision-title"
      >
        <h2 id="intake-decision-title" className="text-lg font-semibold text-slate-900">
          {titleForMode[mode]}
        </h2>

        <div className="mt-4 space-y-4">
          {mode === "request_info" ? (
            <>
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Missing items
                </legend>
                <div className="mt-2 space-y-1.5">
                  {COMMON_MISSING.map((item) => (
                    <label key={item} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={missingItems.includes(item)}
                        onChange={() => toggleMissing(item)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-medium text-slate-700">
                Message / note to referral source
                <textarea className={inp} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} />
                Create follow-up task
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Due date
                <input type="datetime-local" className={inp} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            </>
          ) : null}

          {mode === "clinical_review" ? (
            <>
              {staffOptions.length > 0 ? (
                <label className="block text-sm font-medium text-slate-700">
                  Assign to
                  <select className={inp} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                    <option value="">Clinical manager (auto)</option>
                    {staffOptions.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block text-sm font-medium text-slate-700">
                Clinical question / note
                <textarea className={inp} rows={3} value={clinicalNote} onChange={(e) => setClinicalNote(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Due date
                <input type="datetime-local" className={inp} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            </>
          ) : null}

          {mode === "accept" ? (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Acceptance note
                <textarea className={inp} rows={2} value={acceptNote} onChange={(e) => setAcceptNote(e.target.value)} />
              </label>
              {staffOptions.length > 0 ? (
                <label className="block text-sm font-medium text-slate-700">
                  Assign intake owner
                  <select className={inp} value={intakeOwnerId} onChange={(e) => setIntakeOwnerId(e.target.value)}>
                    <option value="">Default intake owner</option>
                    {staffOptions.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={createSocTask} onChange={(e) => setCreateSocTask(e.target.checked)} />
                Create SOC planning task
              </label>
              <p className="text-xs text-slate-500">
                Patient conversion is not automatic — use the existing Convert action when ready.
              </p>
            </>
          ) : null}

          {mode === "decline" ? (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Decline reason
                <select className={inp} value={declineReason} onChange={(e) => setDeclineReason(e.target.value as LeadIntakeDeclineReason)}>
                  {LEAD_INTAKE_DECLINE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Internal note
                <textarea className={inp} rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
              </label>
              <p className="text-xs text-slate-500">Referral source is not notified automatically.</p>
            </>
          ) : null}

          {mode === "hold" || mode === "payer_review" || mode === "staffing_review" ? (
            <label className="block text-sm font-medium text-slate-700">
              Note
              <textarea className={inp} rows={2} value={holdNote} onChange={(e) => setHoldNote(e.target.value)} />
            </label>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
