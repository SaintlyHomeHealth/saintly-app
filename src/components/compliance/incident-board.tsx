"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveIncident } from "@/lib/compliance/actions";
import { INCIDENT_TYPES, labelFrom } from "@/lib/compliance/constants";
import type { IncidentRow } from "@/lib/compliance/types";
import { formatAppDate } from "@/lib/datetime/app-timezone";
import { PatientField } from "@/components/compliance/patient-field";
import { FormError, saveButtonCls } from "@/components/compliance/record-actions";
import { Field, SelectInput, TextArea, TextInput } from "@/components/compliance/ui";

function showDay(ymd: string): string {
  return formatAppDate(`${ymd}T12:00:00-07:00`, ymd);
}

export function IncidentBoard({
  rows,
  today,
  signerName,
}: {
  rows: IncidentRow[];
  today: string;
  signerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IncidentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-4">
      <div className="compliance-screen-only">
        <button
          type="button"
          className={saveButtonCls(true)}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          + Add Incident / Complaint
        </button>
      </div>
      {open ? (
        <form
          key={editing?.id ?? "new"}
          className="compliance-screen-only space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            const result = await saveIncident(new FormData(event.currentTarget));
            setPending(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            setEditing(null);
            router.refresh();
          }}
        >
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <TextInput type="date" name="occurred_on" required defaultValue={editing?.occurred_on ?? today} />
            </Field>
            <Field label="Type">
              <SelectInput name="incident_type" defaultValue={editing?.incident_type ?? "complaint"} required>
                {INCIDENT_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <PatientField defaultId={editing?.patient_id} defaultName={editing?.patient_name} />
          <Field label="Short description">
            <TextInput name="description" required defaultValue={editing?.description ?? ""} />
          </Field>
          <Field label="Action taken">
            <TextInput name="action_taken" defaultValue={editing?.action_taken ?? ""} />
          </Field>
          <Field label="Handled by">
            <TextInput name="handled_by_name" required defaultValue={editing?.handled_by_name || signerName} />
          </Field>
          <div className="flex flex-wrap gap-4 text-sm font-medium">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="follow_up_needed" value="yes" defaultChecked={editing?.follow_up_needed} />
              Follow-up needed
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="resolved" value="yes" defaultChecked={editing?.resolved} />
              Resolved
            </label>
          </div>
          <Field label="Resolution date">
            <TextInput type="date" name="resolution_date" defaultValue={editing?.resolution_date ?? ""} />
          </Field>
          <Field label="Notes">
            <TextArea name="notes" defaultValue={editing?.notes ?? ""} />
          </Field>
          <FormError message={error} />
          <div className="flex gap-3">
            <button type="submit" className={saveButtonCls(true)} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className={saveButtonCls(false)} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Patient</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Description</th>
              <th className="px-3 py-3">Handled by</th>
              <th className="px-3 py-3">Follow-up</th>
              <th className="compliance-screen-only px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-slate-600">
                  No incidents or complaints for this quarter.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3 whitespace-nowrap">{showDay(row.occurred_on)}</td>
                  <td className="px-3 py-3">{row.patient_name || "—"}</td>
                  <td className="px-3 py-3">{labelFrom(INCIDENT_TYPES, row.incident_type)}</td>
                  <td className="px-3 py-3">{row.description}</td>
                  <td className="px-3 py-3">{row.handled_by_name || "—"}</td>
                  <td className="px-3 py-3">
                    {row.resolved ? "Resolved" : row.follow_up_needed ? "Needed" : "—"}
                  </td>
                  <td className="compliance-screen-only px-3 py-3">
                    <button
                      type="button"
                      className="font-semibold text-sky-700"
                      onClick={() => {
                        setEditing(row);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
