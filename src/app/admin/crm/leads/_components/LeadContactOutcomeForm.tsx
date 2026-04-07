"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { saveLeadOutcome, type SaveLeadOutcomeResult } from "@/app/admin/crm/actions";
import {
  isValidLeadContactOutcome,
  isValidLeadContactType,
  LEAD_CONTACT_OUTCOME_OPTIONS,
} from "@/lib/crm/lead-contact-outcome";
import { LEAD_NEXT_ACTION_OPTIONS } from "@/lib/crm/lead-follow-up-options";

type Props = {
  leadId: string;
  /** `leads.last_outcome` from server — keeps Outcome select in sync after save/refresh */
  savedLastOutcome: string | null;
  /** `leads.last_contact_type` from server */
  savedLastContactType: string | null;
  defaultNextAction: string;
  defaultFollowUpIso: string;
  defaultNotes: string;
  tomorrowIso: string;
  /** Suggested follow-up after voicemail (+2 days from “today” in Central CRM calendar). */
  voicemailSuggestedIso: string;
  inputCls: string;
};

function toastMessage(result: SaveLeadOutcomeResult): string {
  if (result.ok) return "Outcome saved";
  switch (result.error) {
    case "forbidden":
      return "You don't have permission to save this outcome.";
    case "invalid_lead":
      return "Missing lead. Refresh and try again.";
    case "invalid_outcome":
      return "Select a valid outcome.";
    case "invalid_contact_type":
      return "Select call or text.";
    case "save_failed":
      return "Could not save outcome. Try again.";
    default:
      return "Could not save outcome.";
  }
}

function outcomeSelectValue(v: string | null): string {
  if (v && isValidLeadContactOutcome(v)) return v;
  return "";
}

function contactTypeValue(v: string | null): "call" | "text" {
  if (v && isValidLeadContactType(v)) return v;
  return "call";
}

export function LeadContactOutcomeForm({
  leadId,
  savedLastOutcome,
  savedLastContactType,
  defaultNextAction,
  defaultFollowUpIso,
  defaultNotes,
  tomorrowIso,
  voicemailSuggestedIso,
  inputCls,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<null | { type: "ok" | "err"; message: string }>(null);
  const outcomeSelectRef = useRef<HTMLSelectElement>(null);

  const [outcome, setOutcome] = useState(() => outcomeSelectValue(savedLastOutcome));
  const [followUp, setFollowUp] = useState(defaultFollowUpIso);
  const [notes, setNotes] = useState(defaultNotes);
  const [nextAction, setNextAction] = useState(defaultNextAction);
  const [contactType, setContactType] = useState(() => contactTypeValue(savedLastContactType));
  const [outcomeFieldError, setOutcomeFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast || toast.type !== "ok") return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** When `router.refresh()` returns new server props, re-align all fields from DB (incl. last_outcome / last_contact_type). */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- intentional sync from refreshed RSC props */
    setFollowUp(defaultFollowUpIso);
    setNotes(defaultNotes);
    setNextAction(defaultNextAction);
    setOutcome(outcomeSelectValue(savedLastOutcome));
    setContactType(contactTypeValue(savedLastContactType));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [defaultFollowUpIso, defaultNotes, defaultNextAction, savedLastOutcome, savedLastContactType]);

  return (
    <div className="relative">
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setToast(null);
          setOutcomeFieldError(null);

          console.log("[LeadContactOutcomeForm] submit attempt", {
            leadId,
            outcome,
            contactType,
            nextAction,
            followUp,
            notesLen: notes.length,
          });

          const outcomeOk = outcome.trim() !== "";
          const contactOk = contactType === "call" || contactType === "text";
          console.log("[LeadContactOutcomeForm] client validation", { outcomeOk, contactOk });

          if (!outcomeOk) {
            console.warn("[LeadContactOutcomeForm] validation blocked: outcome blank");
            setOutcomeFieldError("Please select an outcome.");
            queueMicrotask(() => {
              outcomeSelectRef.current?.focus();
              outcomeSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
            return;
          }

          if (!contactOk) {
            console.warn("[LeadContactOutcomeForm] validation blocked: contact_type invalid");
            setToast({ type: "err", message: "Select call or text for contact type." });
            return;
          }

          startTransition(async () => {
            try {
              // Build FormData from React state — new FormData(formElement) can omit/mis-serialize controlled fields.
              const fd = new FormData();
              fd.set("leadId", leadId);
              fd.set("outcome", outcome);
              fd.set("contact_type", contactType);
              fd.set("next_action", nextAction);
              fd.set("follow_up_date", followUp);
              fd.set("notes", notes);
              const outgoing: Record<string, string> = {};
              fd.forEach((v, k) => {
                outgoing[k] = typeof v === "string" ? v : String(v);
              });
              console.log("[LeadContactOutcomeForm] outgoing payload (after validation)", outgoing);
              console.log("[LeadContactOutcomeForm] selected outcome raw (state)", outcome);

              const result = await saveLeadOutcome(fd);
              console.log("[LeadContactOutcomeForm] saveLeadOutcome result", result);

              if (result.ok) {
                console.log("[LeadContactOutcomeForm] saveLeadOutcome success", result);
                setOutcomeFieldError(null);
                setToast({ type: "ok", message: toastMessage(result) });
                // Do not clear fields before refresh — that caused empty notes/outcome until props updated.
                // Await refresh so RSC passes new savedLastOutcome / defaultNotes; useEffect syncs from server.
                await router.refresh();
              } else {
                const msg = toastMessage(result);
                console.warn("[LeadContactOutcomeForm] saveLeadOutcome rejected", result, msg);
                setToast({ type: "err", message: msg });
                if (result.error === "invalid_outcome") {
                  setOutcomeFieldError("Please select a valid outcome.");
                  queueMicrotask(() => {
                    outcomeSelectRef.current?.focus();
                    outcomeSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  });
                }
              }
            } catch (err) {
              console.error("[LeadContactOutcomeForm] saveLeadOutcome threw", err);
              setToast({
                type: "err",
                message: err instanceof Error ? err.message : "Could not save outcome. Try again.",
              });
            }
          });
        }}
      >
        <input type="hidden" name="leadId" value={leadId} />
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            <span>
              Outcome <span className="text-red-600">*</span>{" "}
              <span className="font-semibold text-slate-800">(required)</span>
            </span>
            <span id={`lead-contact-outcome-hint-${leadId}`} className="text-[11px] font-normal text-slate-500">
              Required before saving.
            </span>
            <select
              ref={outcomeSelectRef}
              id={`lead-contact-outcome-${leadId}`}
              name="outcome"
              value={outcome}
              aria-invalid={outcomeFieldError ? "true" : "false"}
              aria-describedby={
                outcomeFieldError
                  ? `lead-contact-outcome-hint-${leadId} lead-contact-outcome-err-${leadId}`
                  : `lead-contact-outcome-hint-${leadId}`
              }
              className={`${inputCls} ${outcomeFieldError ? "border-rose-500 ring-2 ring-rose-500/25" : ""}`}
              onChange={(e) => {
                const v = e.target.value;
                setOutcome(v);
                setOutcomeFieldError(null);
                if (v === "no_answer") {
                  setFollowUp(tomorrowIso);
                } else if (v === "left_voicemail") {
                  setFollowUp(voicemailSuggestedIso);
                }
              }}
            >
              <option value="" disabled>
                — Select —
              </option>
              {LEAD_CONTACT_OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {outcomeFieldError ? (
              <p id={`lead-contact-outcome-err-${leadId}`} role="alert" className="text-xs font-medium text-rose-700">
                {outcomeFieldError}
              </p>
            ) : null}
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Contact type <span className="text-red-600">*</span>
            <select
              name="contact_type"
              className={inputCls}
              value={contactType}
              onChange={(e) => setContactType(e.target.value)}
            >
              <option value="call">Call</option>
              <option value="text">Text</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Next action
            <select
              name="next_action"
              className={inputCls}
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
            >
              <option value="">—</option>
              {LEAD_NEXT_ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Follow-up date
            <input
              type="date"
              name="follow_up_date"
              className={inputCls}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Notes
            <textarea
              name="notes"
              rows={3}
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
          {pending ? "Saving…" : "Save outcome"}
        </button>
      </form>
    </div>
  );
}
