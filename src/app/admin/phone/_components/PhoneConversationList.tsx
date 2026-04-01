"use client";

import { useMemo, useState } from "react";

import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import {
  formatCrmOutcomeLabel,
  formatCrmTypeLabel,
  isNeedsFollowUpClassification,
  isSpamClassification,
  readCrmMetadata,
} from "../_lib/crm-metadata";
import type { PhoneCallRow } from "../recent-calls-live";

type PhoneConversationListProps = {
  calls: PhoneCallRow[];
  title?: string;
  subtitle?: string;
  selectedCallId?: string | null;
  onSelectCall?: (callId: string) => void;
};

function displayName(row: PhoneCallRow): string {
  const crm = row.crm_contact_display_name?.trim();
  if (crm) return crm;
  return row.from_e164?.trim() || row.to_e164?.trim() || "Unknown caller";
}

function assignedLabel(row: PhoneCallRow): string {
  if (!row.assigned_to_user_id) return "Unassigned";
  return row.assigned_to_label?.trim() || `User ${row.assigned_to_user_id.slice(0, 8)}…`;
}

export function PhoneConversationList({
  calls,
  title = "Conversations",
  subtitle = "Phone number/name, CRM badges, activity, assignment",
  selectedCallId,
  onSelectCall,
}: PhoneConversationListProps) {
  const [filterType, setFilterType] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");

  const visibleCalls = useMemo(() => {
    return calls.filter((row) => {
      const crm = readCrmMetadata(row);
      if (filterType && crm.type.trim() !== filterType) return false;
      if (filterOutcome && crm.outcome.trim() !== filterOutcome) return false;
      return true;
    });
  }, [calls, filterType, filterOutcome]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2 py-2">
        <label className="flex min-w-[7rem] flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Type
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-800"
          >
            <option value="">All</option>
            <option value="patient">Patient</option>
            <option value="caregiver">Caregiver</option>
            <option value="referral">Referral</option>
            <option value="spam">Spam</option>
          </select>
        </label>
        <label className="flex min-w-[8.5rem] flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Outcome
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-800"
          >
            <option value="">All</option>
            <option value="booked_assessment">Booked assessment</option>
            <option value="needs_followup">Needs follow-up</option>
            <option value="not_qualified">Not qualified</option>
            <option value="wrong_number">Wrong number</option>
          </select>
        </label>
        {(filterType || filterOutcome) && (
          <button
            type="button"
            onClick={() => {
              setFilterType("");
              setFilterOutcome("");
            }}
            className="ml-auto text-[11px] font-semibold text-sky-800 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {visibleCalls.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          {calls.length === 0 ? "No conversations to show." : "No calls match filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCalls.map((row) => {
            const missed = row.status.trim().toLowerCase() === "missed";
            const when = formatAdminPhoneWhen(row.started_at ?? row.created_at);
            const activity = `${row.direction} · ${row.status}`;
            const selected = selectedCallId === row.id;
            const interactive = typeof onSelectCall === "function";
            const crm = readCrmMetadata(row);
            const typeLbl = formatCrmTypeLabel(crm.type);
            const outcomeLbl = formatCrmOutcomeLabel(crm.outcome);
            const spam = isSpamClassification(row);
            const needsFu = isNeedsFollowUpClassification(row);

            const baseCard = spam
              ? "border-slate-400 bg-gradient-to-br from-slate-50 to-slate-100/90 ring-1 ring-slate-300/60"
              : missed
                ? "border-rose-200 bg-rose-50/60"
                : "border-slate-200 bg-white hover:bg-slate-50/60";

            const followAccent = needsFu ? "border-l-[3px] border-l-amber-500 pl-[calc(0.75rem-3px)]" : "";

            return (
              <button
                key={row.id}
                type="button"
                disabled={!interactive}
                onClick={() => onSelectCall?.(row.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${baseCard} ${followAccent} ${
                  selected
                    ? "ring-2 ring-slate-900/15 ring-offset-2 ring-offset-white"
                    : ""
                } ${interactive ? "cursor-pointer" : "cursor-default"}`}
                aria-current={selected ? "true" : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">{displayName(row)}</p>
                  <p className="shrink-0 text-[11px] text-slate-500">{when}</p>
                </div>
                {(typeLbl || outcomeLbl || spam || needsFu) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {spam ? (
                      <span className="inline-flex rounded-md border border-slate-400/70 bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                        Spam
                      </span>
                    ) : null}
                    {typeLbl && !spam ? (
                      <span className="inline-flex rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
                        {typeLbl}
                      </span>
                    ) : null}
                    {outcomeLbl ? (
                      <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900">
                        {outcomeLbl}
                      </span>
                    ) : null}
                    {needsFu && !spam ? (
                      <span className="inline-flex rounded-md border border-amber-300 bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                        Follow-up
                      </span>
                    ) : null}
                  </div>
                )}
                <p className="mt-1 truncate text-xs text-slate-600">{activity}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-700">{assignedLabel(row)}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
