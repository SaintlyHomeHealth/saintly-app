"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveOnCall, signNilOnCall } from "@/lib/compliance/actions";
import type { AttestationRow, OnCallRow } from "@/lib/compliance/types";
import { formatAppDateTime, isoInstantToDatetimeLocalInput } from "@/lib/datetime/app-timezone";
import { PatientField } from "@/components/compliance/patient-field";
import { FormError, saveButtonCls } from "@/components/compliance/record-actions";
import { Field, TextArea, TextInput } from "@/components/compliance/ui";

export function OnCallBoard({
  rows,
  today,
  time,
  signerName,
  year,
  quarter,
  month,
  attestation,
  monthAttestation,
  allowMonthNil,
}: {
  rows: OnCallRow[];
  today: string;
  time: string;
  signerName: string;
  year: number;
  quarter: number;
  month: number;
  attestation: AttestationRow | null;
  monthAttestation: AttestationRow | null;
  allowMonthNil: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OnCallRow | null>(null);
  const editingLocal = editing ? isoInstantToDatetimeLocalInput(editing.occurred_at) : "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nilFor, setNilFor] = useState<"quarter" | "month" | null>(null);

  function startNew() {
    setEditing(null);
    setError(null);
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="compliance-screen-only flex flex-wrap gap-3">
        <button type="button" className={saveButtonCls(true)} onClick={startNew}>
          + Add Call
        </button>
        {rows.length === 0 && !attestation ? (
          <button type="button" className={saveButtonCls(false)} onClick={() => setNilFor("quarter")}>
            Sign no-calls page for quarter
          </button>
        ) : null}
        {allowMonthNil && rows.length === 0 && !monthAttestation ? (
          <button type="button" className={saveButtonCls(false)} onClick={() => setNilFor("month")}>
            Sign no-calls page for month
          </button>
        ) : null}
      </div>

      {open ? (
        <form
          key={editing?.id ?? "new"}
          className="compliance-screen-only space-y-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            const result = await saveOnCall(new FormData(event.currentTarget));
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
              <TextInput type="date" name="call_date" required defaultValue={editingLocal ? editingLocal.slice(0, 10) : today} />
            </Field>
            <Field label="Time">
              <TextInput type="time" name="call_time" required defaultValue={editingLocal ? editingLocal.slice(11, 16) : time} />
            </Field>
          </div>
          <PatientField required defaultId={editing?.patient_id} defaultName={editing?.patient_name} />
          <Field label="Reason for call">
            <TextInput name="reason" required defaultValue={editing?.reason ?? ""} />
          </Field>
          <Field label="Action taken">
            <TextInput name="action_taken" required defaultValue={editing?.action_taken ?? ""} />
          </Field>
          <Field label="Handled by">
            <TextInput name="handled_by_name" required defaultValue={editing?.handled_by_name || signerName} />
          </Field>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Optional follow-up and notes</summary>
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="follow_up_needed" value="yes" defaultChecked={editing?.follow_up_needed} />
                Follow-up needed
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="follow_up_completed" value="yes" defaultChecked={editing?.follow_up_completed} />
                Follow-up completed
              </label>
              <Field label="Notes">
                <TextArea name="notes" defaultValue={editing?.notes ?? ""} />
              </Field>
            </div>
          </details>
          <FormError message={error} />
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={saveButtonCls(true)} disabled={pending}>
              {pending ? "Saving…" : "Save call"}
            </button>
            <button
              type="button"
              className={saveButtonCls(false)}
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {nilFor ? (
        <form
          className="compliance-screen-only space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            const result = await signNilOnCall(new FormData(event.currentTarget));
            setPending(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setNilFor(null);
            router.refresh();
          }}
        >
          <input type="hidden" name="period_kind" value={nilFor} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="period" value={nilFor === "quarter" ? quarter : month} />
          <p className="text-sm text-slate-800">
            No after-hours/on-call calls were reported during this reporting period.
          </p>
          <Field label="Administrator name">
            <TextInput name="admin_signed_name" defaultValue={signerName} required />
          </Field>
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" name="admin_sign_confirm" value="yes" required />
            I confirm this typed name is my electronic signature.
          </label>
          <FormError message={error} />
          <div className="flex gap-3">
            <button type="submit" className={saveButtonCls(true)} disabled={pending}>
              Sign no-calls page
            </button>
            <button type="button" className={saveButtonCls(false)} onClick={() => setNilFor(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Date/Time</th>
              <th className="px-3 py-3">Patient</th>
              <th className="px-3 py-3">Reason</th>
              <th className="px-3 py-3">Handled by</th>
              <th className="px-3 py-3">Follow-up</th>
              <th className="compliance-screen-only px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-slate-600">
                  No calls in this period.
                  {attestation ? " A signed no-calls page is on file for the quarter." : ""}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 whitespace-nowrap">{formatAppDateTime(row.occurred_at)}</td>
                  <td className="px-3 py-3">{row.patient_name}</td>
                  <td className="px-3 py-3">{row.reason}</td>
                  <td className="px-3 py-3">{row.handled_by_name}</td>
                  <td className="px-3 py-3">
                    {row.follow_up_needed ? (row.follow_up_completed ? "Done" : "Needed") : "—"}
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
