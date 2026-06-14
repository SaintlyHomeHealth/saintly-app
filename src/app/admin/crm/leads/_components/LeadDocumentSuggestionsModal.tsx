"use client";

import { useMemo, useState } from "react";

import type {
  ApplyLeadDocumentSuggestionsInput,
  LeadDocumentIntakeSummary,
  LeadReferralDocumentAiChecklistSuggestion,
} from "@/lib/crm/lead-referral-document-ai-types";
import { LEAD_REFERRAL_DOCUMENT_TYPE_LABELS } from "@/lib/crm/lead-referral-documents-constants";

export type LeadDocumentSuggestionsLeadContext = {
  patientFirstName: string;
  patientLastName: string;
  dob: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  primaryPayerName: string;
  payerName: string;
  serviceType: string;
  notes: string;
  referringProviderName: string;
  doctorOfficeName: string;
  doctorOfficePhone: string;
  referringDoctorName: string;
};

type FieldKey = keyof ApplyLeadDocumentSuggestionsInput["selected_fields"];

type FieldRow = {
  key: FieldKey;
  label: string;
  current: string;
  suggested: string;
};

function splitAddress(address: string): { line1: string; city: string; state: string; zip: string } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const last = parts[parts.length - 1] ?? "";
    const stateZip = last.split(/\s+/);
    return {
      line1: parts[0] ?? "",
      city: parts.length > 2 ? parts[parts.length - 2] ?? "" : "",
      state: stateZip[0] ?? "",
      zip: stateZip[1] ?? "",
    };
  }
  return { line1: address, city: "", state: "", zip: "" };
}

export function LeadDocumentSuggestionsModal(props: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  summary: LeadDocumentIntakeSummary;
  leadContext: LeadDocumentSuggestionsLeadContext;
  onApplied: () => void;
}) {
  const { open, onClose, leadId, summary, leadContext, onApplied } = props;

  const addrFromAi = useMemo(() => splitAddress(summary.patient.address), [summary.patient.address]);

  const fieldRows: FieldRow[] = useMemo(
    () => [
      {
        key: "patient_first_name",
        label: "Patient first name",
        current: leadContext.patientFirstName,
        suggested: summary.patient.first_name,
      },
      {
        key: "patient_last_name",
        label: "Patient last name",
        current: leadContext.patientLastName,
        suggested: summary.patient.last_name,
      },
      { key: "dob", label: "Date of birth", current: leadContext.dob, suggested: summary.patient.dob },
      { key: "phone", label: "Phone", current: leadContext.phone, suggested: summary.patient.phone },
      {
        key: "address_line_1",
        label: "Address line 1",
        current: leadContext.addressLine1,
        suggested: addrFromAi.line1 || summary.patient.address,
      },
      { key: "city", label: "City", current: leadContext.city, suggested: addrFromAi.city },
      { key: "state", label: "State", current: leadContext.state, suggested: addrFromAi.state },
      { key: "zip", label: "ZIP", current: leadContext.zip, suggested: addrFromAi.zip },
      {
        key: "primary_payer_name",
        label: "Primary payer",
        current: leadContext.primaryPayerName,
        suggested: summary.payer.name,
      },
      {
        key: "service_type",
        label: "Service needed",
        current: leadContext.serviceType,
        suggested: summary.services_requested.join(", "),
      },
      {
        key: "referring_provider_name",
        label: "Ordering provider",
        current: leadContext.referringProviderName,
        suggested: summary.provider.ordering_provider_name,
      },
      {
        key: "doctor_office_name",
        label: "Practice / office",
        current: leadContext.doctorOfficeName,
        suggested: summary.provider.practice_name,
      },
      {
        key: "doctor_office_phone",
        label: "Provider phone",
        current: leadContext.doctorOfficePhone,
        suggested: summary.provider.phone,
      },
      {
        key: "referring_doctor_name",
        label: "Referring doctor",
        current: leadContext.referringDoctorName,
        suggested: summary.provider.ordering_provider_name,
      },
      {
        key: "notes",
        label: "Clinical / referral notes",
        current: leadContext.notes,
        suggested: summary.diagnoses_or_clinical_notes ?? "",
      },
    ],
    [summary, leadContext, addrFromAi]
  );

  const applicableFields = fieldRows.filter((f) => f.suggested.trim());

  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [checklistSelected, setChecklistSelected] = useState<Record<string, boolean>>({});
  const [staffNote, setStaffNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function valueForField(row: FieldRow): string {
    if (fieldValues[row.key] !== undefined) return fieldValues[row.key];
    return row.suggested;
  }

  async function apply() {
    setError(null);
    setPending(true);
    try {
      const selected_fields: ApplyLeadDocumentSuggestionsInput["selected_fields"] = {};
      for (const row of applicableFields) {
        if (!selectedFields[row.key]) continue;
        const v = valueForField(row).trim();
        if (!v) continue;
        selected_fields[row.key] = v;
      }

      const selected_checklist_updates = summary.suggested_checklist_updates.map((item) => ({
        key: item.key,
        apply: Boolean(checklistSelected[item.key]),
      }));

      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/documents/apply-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_fields,
          selected_checklist_updates,
          notes: staffNote.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError("Could not apply suggestions. Try again.");
        return;
      }
      onApplied();
      onClose();
    } catch {
      setError("Could not apply suggestions. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="ai-suggestions-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="ai-suggestions-title" className="text-lg font-semibold text-slate-900">
              Apply AI suggestions
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Review and edit before applying. Checked fields will update the lead.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>
        ) : null}

        {summary.warnings.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {summary.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <section className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Lead fields</h3>
          {applicableFields.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No field suggestions from AI yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {applicableFields.map((row) => (
                <div key={row.key} className="rounded-xl border border-slate-200 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedFields[row.key])}
                      onChange={(e) =>
                        setSelectedFields((prev) => ({ ...prev, [row.key]: e.target.checked }))
                      }
                      className="rounded border-slate-300"
                    />
                    {row.label}
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-500">Current: </span>
                      {row.current.trim() || "—"}
                    </div>
                    <input
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-900"
                      value={valueForField(row)}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [row.key]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {summary.suggested_checklist_updates.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Checklist suggestions</h3>
            <div className="mt-3 space-y-2">
              {summary.suggested_checklist_updates.map((item: LeadReferralDocumentAiChecklistSuggestion) => (
                <label
                  key={item.key}
                  className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(checklistSelected[item.key])}
                    onChange={(e) =>
                      setChecklistSelected((prev) => ({ ...prev, [item.key]: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-emerald-300"
                  />
                  <span>
                    <span className="font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-emerald-900">{item.reason}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <label className="mt-6 block text-sm font-medium text-slate-700">
          Staff note (optional)
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={2}
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
          />
        </label>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void apply()}
            className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {pending ? "Applying…" : "Apply selected"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function aiStatusLabel(doc: {
  status: string;
  ai_processed_at: string | null;
  ai_processing_error: string | null;
}): string {
  if (doc.status === "processing") return "Processing";
  if (doc.status === "ready" && doc.ai_processed_at) return "Ready";
  if (doc.status === "failed" || doc.ai_processing_error) return "Failed";
  return "Not analyzed";
}

export function formatDetectedType(type: string | null): string {
  if (!type) return "Unspecified";
  if (type in LEAD_REFERRAL_DOCUMENT_TYPE_LABELS) {
    return LEAD_REFERRAL_DOCUMENT_TYPE_LABELS[type as keyof typeof LEAD_REFERRAL_DOCUMENT_TYPE_LABELS];
  }
  return type;
}
