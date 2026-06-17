"use client";

import { useState } from "react";

import { PT_COLD_CALL_QUICK_ACTIONS } from "@/lib/recruiting/pt-cold-call-options";
import type { PtColdCallTargetWithLatest } from "@/lib/recruiting/pt-cold-call-types";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  StatusBadge,
  actionBtn,
  formatShortDate,
  telHref,
  websiteHref,
} from "./pt-cold-call-shared";

type Props = {
  target: PtColdCallTargetWithLatest;
  onQuickAction: (targetId: string, actionId: string) => Promise<void>;
  onAddNote: (target: PtColdCallTargetWithLatest) => void;
  onScheduleFollowUp: (target: PtColdCallTargetWithLatest) => void;
  onEditContact: (target: PtColdCallTargetWithLatest) => void;
  onConvert: (target: PtColdCallTargetWithLatest) => void;
};

export function PtColdCallSavedCard({
  target,
  onQuickAction,
  onAddNote,
  onScheduleFollowUp,
  onEditContact,
  onConvert,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const tel = telHref(target.phone);
  const site = websiteHref(target.website);
  const cityZip = [target.city, target.zip_code].filter(Boolean).join(" ");
  const latestNote = target.latest_log?.notes ?? target.recruiter_notes ?? null;

  async function run(actionId: string) {
    setBusy(actionId);
    try {
      await onQuickAction(target.id, actionId);
    } finally {
      setBusy(null);
    }
  }

  const dormant =
    target.do_not_call || ["Do Not Call", "Bad Number", "Not Interested", "Hired"].includes(target.status);
  const borderClass = dormant
    ? "border-rose-200"
    : target.status === "Candidate Identified" || target.status === "Interested"
      ? "border-emerald-200"
      : "border-slate-200";

  return (
    <article className={`rounded-2xl border ${borderClass} bg-white p-4 shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{target.clinic_name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={target.status} />
            {target.do_not_call && target.status !== "Do Not Call" ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-900 ring-1 ring-rose-200">
                Do Not Call
              </span>
            ) : null}
            {target.converted_candidate_id ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-200">
                Candidate ✓
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-700">
        {target.phone ? formatPhoneForDisplay(target.phone) : "No phone"}
        {cityZip ? <span className="text-slate-500"> · {cityZip}</span> : null}
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-4">
        <div>
          <dt className="font-semibold text-slate-400">Attempts</dt>
          <dd className="text-slate-800">{target.call_attempts}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">Last called</dt>
          <dd className="text-slate-800">{formatShortDate(target.last_called_at)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">Next follow-up</dt>
          <dd className="text-slate-800">{formatShortDate(target.next_follow_up_at)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">Spoke with</dt>
          <dd className="text-slate-800">{target.contact_person || "—"}</dd>
        </div>
      </dl>

      {target.follow_up_reason ? (
        <p className="mt-1 text-[11px] text-amber-800">Follow-up: {target.follow_up_reason}</p>
      ) : null}

      {latestNote ? (
        <p className="mt-2 line-clamp-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold text-slate-500">Latest: </span>
          {latestNote}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {tel ? (
          <a href={tel} className={`${actionBtn} border-sky-300 bg-sky-50 text-sky-900`}>
            Call
          </a>
        ) : null}
        {site ? (
          <a href={site} target="_blank" rel="noreferrer" className={actionBtn}>
            Website
          </a>
        ) : null}
        {target.google_maps_url ? (
          <a href={target.google_maps_url} target="_blank" rel="noreferrer" className={actionBtn}>
            Maps
          </a>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {PT_COLD_CALL_QUICK_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(a.id)}
            className={`${actionBtn} ${a.doNotCall ? "border-rose-200 text-rose-800 hover:bg-rose-50" : ""} ${
              busy === a.id ? "opacity-60" : ""
            }`}
          >
            {busy === a.id ? "…" : a.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onScheduleFollowUp(target)} className={actionBtn}>
          Schedule Follow-Up
        </button>
        <button type="button" onClick={() => onAddNote(target)} className={actionBtn}>
          Add Note
        </button>
        <button type="button" onClick={() => onEditContact(target)} className={actionBtn}>
          Edit Contact
        </button>
        <button
          type="button"
          onClick={() => onConvert(target)}
          className={`${actionBtn} border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`}
        >
          {target.converted_candidate_id ? "Candidate Linked" : "Convert to Candidate"}
        </button>
      </div>
    </article>
  );
}
