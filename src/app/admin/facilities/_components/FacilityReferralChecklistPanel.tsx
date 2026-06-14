"use client";

import { useState } from "react";

import type { FacilityReferralChecklistRow } from "@/lib/crm/facility-referral-pipeline-types";

const ITEMS: { key: keyof FacilityReferralChecklistRow; label: string }[] = [
  { key: "patient_contacted", label: "Patient contacted" },
  { key: "insurance_verified", label: "Insurance verified" },
  { key: "service_need_confirmed", label: "Service need confirmed" },
  { key: "orders_requested", label: "Orders requested" },
  { key: "f2f_requested", label: "F2F requested / confirmed" },
  { key: "packet_received", label: "Referral packet received" },
  { key: "soc_availability_checked", label: "SOC availability checked" },
  { key: "clinician_scheduling_started", label: "Clinician assigned / scheduling started" },
  { key: "referral_source_updated", label: "Referral source updated" },
  { key: "converted_or_closed", label: "Converted or closed" },
];

type FacilityReferralChecklistPanelProps = {
  leadId: string;
  checklist: FacilityReferralChecklistRow | null;
  readOnly?: boolean;
  onUpdated?: (checklist: FacilityReferralChecklistRow) => void;
};

export function FacilityReferralChecklistPanel({
  leadId,
  checklist,
  readOnly = false,
  onUpdated,
}: FacilityReferralChecklistPanelProps) {
  const [local, setLocal] = useState<FacilityReferralChecklistRow | null>(checklist);
  const [saving, setSaving] = useState(false);

  async function toggle(key: keyof FacilityReferralChecklistRow, value: boolean) {
    if (readOnly || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/facilities/referrals/${leadId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = (await res.json()) as { ok: boolean; checklist?: FacilityReferralChecklistRow };
      if (data.ok && data.checklist) {
        setLocal(data.checklist);
        onUpdated?.(data.checklist);
      }
    } finally {
      setSaving(false);
    }
  }

  const row = local ?? checklist;

  const suggestions = Array.isArray(row?.checklist_json?.document_upload_suggestions)
    ? (row!.checklist_json!.document_upload_suggestions as Array<{
        label?: string;
        reason?: string;
      }>)
    : [];
  const appliedAi = Array.isArray(row?.checklist_json?.applied_ai_checklist_completions)
    ? (row!.checklist_json!.applied_ai_checklist_completions as Array<{ key?: string; label?: string }>)
    : [];

  return (
    <div className="space-y-2">
      {suggestions.length > 0 ? (
        <div className="mb-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">Suggested from uploaded documents</p>
          {suggestions.map((s, i) => (
            <p key={i} className="text-xs text-emerald-950">
              {s.label ?? "Checklist item"} — {s.reason ?? "Document uploaded."}
            </p>
          ))}
        </div>
      ) : null}
      {appliedAi.length > 0 ? (
        <div className="mb-3 space-y-1 rounded-lg border border-violet-200 bg-violet-50/70 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-900">Applied from AI review</p>
          {appliedAi.map((s, i) => (
            <p key={i} className="text-xs text-violet-950">
              {s.label ?? s.key ?? "Checklist item"}
            </p>
          ))}
        </div>
      ) : null}
      {ITEMS.map(({ key, label }) => (
        <label
          key={key}
          className={`flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-800 ${readOnly ? "opacity-80" : ""}`}
        >
          <input
            type="checkbox"
            checked={Boolean(row?.[key])}
            disabled={readOnly || saving}
            onChange={(e) => void toggle(key, e.target.checked)}
            className="rounded border-slate-300"
          />
          {label}
        </label>
      ))}
    </div>
  );
}
