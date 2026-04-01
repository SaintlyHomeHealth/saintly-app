"use client";

import { useState } from "react";

import { saveLeadContactOutcome } from "@/app/admin/crm/actions";
import { LEAD_CONTACT_OUTCOME_OPTIONS } from "@/lib/crm/lead-contact-outcome";
import { LEAD_NEXT_ACTION_OPTIONS } from "@/lib/crm/lead-follow-up-options";

type Props = {
  leadId: string;
  defaultNextAction: string;
  defaultFollowUpIso: string;
  defaultNotes: string;
  tomorrowIso: string;
  /** Suggested follow-up after voicemail (+2 days from “today” in Central CRM calendar). */
  voicemailSuggestedIso: string;
  inputCls: string;
};

export function LeadContactOutcomeForm({
  leadId,
  defaultNextAction,
  defaultFollowUpIso,
  defaultNotes,
  tomorrowIso,
  voicemailSuggestedIso,
  inputCls,
}: Props) {
  const [followUp, setFollowUp] = useState(defaultFollowUpIso);
  const [outcome, setOutcome] = useState("");

  return (
    <form action={saveLeadContactOutcome} className="space-y-4">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
          Outcome <span className="text-red-600">*</span>
          <select
            name="outcome"
            required
            value={outcome}
            className={inputCls}
            onChange={(e) => {
              const v = e.target.value;
              setOutcome(v);
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
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Contact type <span className="text-red-600">*</span>
          <select name="contact_type" required className={inputCls} defaultValue="call">
            <option value="call">Call</option>
            <option value="text">Text</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Next action
          <select name="next_action" className={inputCls} defaultValue={defaultNextAction}>
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
          <textarea name="notes" rows={3} className={inputCls} defaultValue={defaultNotes} placeholder="Optional" />
        </label>
      </div>
      <button
        type="submit"
        className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Save outcome
      </button>
    </form>
  );
}
