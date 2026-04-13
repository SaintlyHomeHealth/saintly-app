"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { type SaveLeadOutcomeResult } from "@/app/admin/crm/actions";
import {
  normalizeAttemptActionKeys,
  normalizeContactOutcomeResult,
} from "@/lib/crm/lead-contact-outcome-normalize";
import {
  isValidLeadContactOutcome,
  LEAD_CONTACT_OUTCOME_OPTIONS,
} from "@/lib/crm/lead-contact-outcome";
import { LEAD_NEXT_ACTION_OPTIONS } from "@/lib/crm/lead-follow-up-options";
import { ATTEMPT_ACTION_KEYS, type AttemptActionKey } from "@/lib/crm/lead-contact-log";

type Props = {
  leadId: string;
  savedLastOutcome: string | null;
  defaultNextAction: string;
  defaultFollowUpIso: string;
  /** ISO instant when server has `follow_up_at`; drives date+time fields. */
  defaultFollowUpAtIso: string | null;
  tomorrowIso: string;
  voicemailSuggestedIso: string;
  inputCls: string;
};

function toastMessage(result: SaveLeadOutcomeResult): string {
  if (result.ok) return "Outcome saved";
  if (!result.ok && result.message) return result.message;
  switch (result.error) {
    case "forbidden":
      return "You don't have permission to save this outcome.";
    case "invalid_lead":
      return "Missing lead. Refresh and try again.";
    case "invalid_outcome":
      return "Select a result and at least one attempted action.";
    case "invalid_contact_type":
      return "Select call or text for contact type.";
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

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultFollowUpParts(followIso: string, followAtIso: string | null): { date: string; time: string } {
  if (followAtIso) {
    const d = new Date(followAtIso);
    if (!Number.isNaN(d.getTime())) {
      return { date: toDatetimeLocalValue(d).slice(0, 10), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
    }
  }
  const d = followIso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return { date: d, time: "09:00" };
  }
  return { date: "", time: "09:00" };
}

function helperForOutcome(outcome: string): string | null {
  switch (outcome) {
    case "no_answer":
      return "Tip: mark whether voicemail was left and whether a text was sent.";
    case "spoke":
    case "spoke_scheduled":
      return "Capture the next step before saving.";
    case "left_voicemail":
      return "Set a follow-up date and time so this lead does not get lost.";
    default:
      return null;
  }
}

export function LeadContactOutcomeForm({
  leadId,
  savedLastOutcome,
  defaultNextAction,
  defaultFollowUpIso,
  defaultFollowUpAtIso,
  tomorrowIso,
  voicemailSuggestedIso,
  inputCls,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<null | { type: "ok" | "err"; message: string }>(null);
  const outcomeSelectRef = useRef<HTMLSelectElement>(null);

  const [outcome, setOutcome] = useState(() => outcomeSelectValue(savedLastOutcome));
  const [actions, setActions] = useState<Set<AttemptActionKey>>(new Set());
  const [attemptLocal, setAttemptLocal] = useState(() => toDatetimeLocalValue(new Date()));
  const [followDate, setFollowDate] = useState(() => defaultFollowUpParts(defaultFollowUpIso, defaultFollowUpAtIso).date);
  const [followTime, setFollowTime] = useState(() => defaultFollowUpParts(defaultFollowUpIso, defaultFollowUpAtIso).time);
  /** Only this attempt's note — not the full running `last_note` log. */
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState(defaultNextAction);
  const [outcomeFieldError, setOutcomeFieldError] = useState<string | null>(null);

  const followUpInstantIso = useMemo(() => {
    if (!followDate.trim()) return "";
    const t = followTime.trim() || "09:00";
    const d = new Date(`${followDate.trim()}T${t}:00`);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString();
  }, [followDate, followTime]);

  const attemptInstantIso = useMemo(() => {
    const d = new Date(attemptLocal);
    if (Number.isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  }, [attemptLocal]);

  useEffect(() => {
    if (!toast || toast.type !== "ok") return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setFollowDate(defaultFollowUpParts(defaultFollowUpIso, defaultFollowUpAtIso).date);
    setFollowTime(defaultFollowUpParts(defaultFollowUpIso, defaultFollowUpAtIso).time);
    setNextAction(defaultNextAction);
    setOutcome(outcomeSelectValue(savedLastOutcome));
  }, [defaultFollowUpIso, defaultFollowUpAtIso, defaultNextAction, savedLastOutcome]);

  const toggleAction = (k: AttemptActionKey) => {
    setActions((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const chipCls =
    "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50";

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

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quick actions</span>
        <button type="button" className={chipCls} onClick={() => {
          setOutcome("spoke");
          setActions(new Set(["called", "spoke_live"]));
        }}>
          Spoke
        </button>
        <button type="button" className={chipCls} onClick={() => {
          setOutcome("left_voicemail");
          setActions(new Set(["called", "left_voicemail"]));
          setFollowDate(voicemailSuggestedIso.slice(0, 10));
          setFollowTime("09:00");
        }}>
          Left VM
        </button>
        <button type="button" className={chipCls} onClick={() => {
          setOutcome("text_sent");
          setActions(new Set(["sent_text"]));
        }}>
          Sent text
        </button>
        <button type="button" className={chipCls} onClick={() => {
          setOutcome("no_answer");
          setActions(new Set(["called"]));
          setFollowDate(tomorrowIso);
          setFollowTime("09:00");
        }}>
          Called
        </button>
      </div>

      <form
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setToast(null);
          setOutcomeFieldError(null);

          if (!outcome.trim()) {
            setOutcomeFieldError("Please select a contact result.");
            queueMicrotask(() => {
              outcomeSelectRef.current?.focus();
              outcomeSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
            return;
          }

          if (actions.size === 0) {
            setToast({ type: "err", message: "Select at least one attempted action." });
            return;
          }

          startTransition(async () => {
            try {
              const payload = {
                contact_result: normalizeContactOutcomeResult(outcome),
                attempted_actions: normalizeAttemptActionKeys([...actions]),
                attempt_at: attemptInstantIso,
                next_step: nextAction.trim() || null,
                follow_up_at: followUpInstantIso || null,
                outcome_note: notes.trim() || null,
                lead_id: leadId,
              };
              console.log("CONTACT OUTCOME PAYLOAD", payload);

              const res = await fetch("/api/crm/contact-outcome", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              let result: SaveLeadOutcomeResult;
              try {
                result = (await res.json()) as SaveLeadOutcomeResult;
              } catch {
                setToast({ type: "err", message: `Save failed (${res.status})` });
                return;
              }

              if (result.ok) {
                setOutcomeFieldError(null);
                setNotes("");
                setActions(new Set());
                setToast({ type: "ok", message: toastMessage(result) });
                await router.refresh();
              } else {
                setToast({ type: "err", message: toastMessage(result) });
                if (result.error === "invalid_outcome") {
                  setOutcomeFieldError("Check result and attempted actions.");
                }
              }
            } catch (err) {
              console.error(err);
              setToast({
                type: "err",
                message: err instanceof Error ? err.message : "Failed to save outcome",
              });
            }
          });
        }}
      >
        <input type="hidden" name="leadId" value={leadId} />

        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            <span>
              Contact result <span className="text-red-600">*</span>
            </span>
            <select
              ref={outcomeSelectRef}
              name="outcome"
              value={outcome}
              aria-invalid={outcomeFieldError ? "true" : "false"}
              className={`${inputCls} ${outcomeFieldError ? "border-rose-500 ring-2 ring-rose-500/25" : ""}`}
              onChange={(e) => {
                const v = e.target.value;
                setOutcome(v);
                setOutcomeFieldError(null);
                if (v === "no_answer") {
                  setFollowDate(tomorrowIso);
                  setFollowTime("09:00");
                } else if (v === "left_voicemail") {
                  setFollowDate(voicemailSuggestedIso.slice(0, 10));
                  setFollowTime("09:00");
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
              <p role="alert" className="text-xs font-medium text-rose-700">
                {outcomeFieldError}
              </p>
            ) : null}
            {helperForOutcome(outcome) ? (
              <p className="text-[11px] font-normal text-slate-500">{helperForOutcome(outcome)}</p>
            ) : null}
          </label>

          <div className="sm:col-span-2">
            <p className="text-[11px] font-medium text-slate-600">
              Attempted actions <span className="text-red-600">*</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {ATTEMPT_ACTION_KEYS.map((k) => (
                <label key={k} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={actions.has(k)}
                    onChange={() => toggleAction(k)}
                    className="rounded border-slate-300 text-sky-700 focus:ring-sky-600"
                  />
                  <span>
                    {k === "called"
                      ? "Called"
                      : k === "left_voicemail"
                        ? "Left voicemail"
                        : k === "sent_text"
                          ? "Sent text"
                          : k === "received_text"
                            ? "Received text"
                            : "Spoke live"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Attempt date &amp; time
            <input
              type="datetime-local"
              className={inputCls}
              value={attemptLocal}
              onChange={(e) => setAttemptLocal(e.target.value)}
            />
            <span className="text-[11px] font-normal text-slate-500">When this attempt happened (defaults to now).</span>
          </label>

          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Next step
            <select name="next_action" className={inputCls} value={nextAction} onChange={(e) => setNextAction(e.target.value)}>
              <option value="">—</option>
              {LEAD_NEXT_ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Follow-up date
            <input type="date" className={inputCls} value={followDate} onChange={(e) => setFollowDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Follow-up time
            <input type="time" className={inputCls} value={followTime} onChange={(e) => setFollowTime(e.target.value)} />
          </label>

          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Outcome note
            <textarea
              name="notes"
              rows={4}
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened on this attempt? Be specific — this appends to the contact log."
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
          {pending ? "Saving…" : "Save outcome"}
        </button>
      </form>
    </div>
  );
}
