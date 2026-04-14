"use client";

import { useMemo, useState } from "react";

import { savePayerCredentialingRecordEmails } from "@/app/admin/credentialing/actions";

function newRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r_${Math.random().toString(36).slice(2)}`;
}

export type EmailFormRow = {
  id: string;
  email: string;
  label: string;
  is_primary: boolean;
};

export function PayerCredentialingEmailsForm({
  credentialingId,
  initialRows,
}: {
  credentialingId: string;
  initialRows: Omit<EmailFormRow, "id">[];
}) {
  const seeded = useMemo(() => {
    const base: EmailFormRow[] =
      initialRows.length > 0
        ? initialRows.map((r, i) => ({
            id: newRowId(),
            email: r.email,
            label: r.label ?? "",
            is_primary: r.is_primary ?? i === 0,
          }))
        : [{ id: newRowId(), email: "", label: "", is_primary: true }];
    if (!base.some((r) => r.is_primary) && base.length) base[0] = { ...base[0], is_primary: true };
    return base;
  }, [initialRows]);

  const [rows, setRows] = useState<EmailFormRow[]>(seeded);

  function addRow() {
    setRows((prev) => [...prev, { id: newRowId(), email: "", label: "", is_primary: false }]);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (next.length === 0) return [{ id: newRowId(), email: "", label: "", is_primary: true }];
      if (!next.some((r) => r.is_primary)) next[0] = { ...next[0], is_primary: true };
      return next;
    });
  }

  return (
    <form
      key={rows.map((r) => r.id).join(",")}
      action={savePayerCredentialingRecordEmails}
      className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
    >
      <input type="hidden" name="credentialing_id" value={credentialingId} />
      <input type="hidden" name="email_row_count" value={rows.length} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Email addresses</p>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-50"
        >
          Add another email
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        One primary address for quick actions. Optional labels (e.g. credentialing, contracting, escalation).
      </p>

      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={row.id} className="rounded-xl border border-white bg-white p-3 shadow-sm">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Email
                <input
                  name={`email_${i}_address`}
                  type="email"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  defaultValue={row.email}
                  placeholder="name@domain.com"
                  autoComplete="email"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Label (optional)
                <input
                  name={`email_${i}_label`}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  defaultValue={row.label}
                  placeholder="credentialing, contracting…"
                  maxLength={120}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
                  <input
                    type="radio"
                    name="email_primary"
                    value={String(i)}
                    defaultChecked={row.is_primary}
                    className="border-slate-300"
                  />
                  Primary
                </label>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-900 hover:bg-red-100"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="submit"
        className="rounded-xl border border-violet-600 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100"
      >
        Save email addresses
      </button>
    </form>
  );
}
