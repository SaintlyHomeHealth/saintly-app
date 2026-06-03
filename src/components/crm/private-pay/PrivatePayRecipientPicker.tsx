"use client";

import { useEffect, useState } from "react";

import { FormattedPhoneInput } from "@/components/phone/FormattedPhoneInput";
import { validatePrivatePayCustomerInput } from "@/lib/private-pay/customer-input";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import type { PrivatePayCustomerInput, PrivatePayRecipient, PrivatePayRecipientSearchResult } from "@/lib/private-pay/types";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const labelCls = "flex flex-col gap-1 text-[11px] font-medium text-slate-600";

const emptyCustomerForm = (): PrivatePayCustomerInput => ({
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  zip: "",
  notes: "",
});

function ResultGroup({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: PrivatePayRecipient[];
  onSelect: (row: PrivatePayRecipient) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-1 space-y-1">
        {rows.map((row) => (
          <li key={`${row.kind}-${row.contact_id}-${row.patient_id ?? ""}-${row.lead_id ?? ""}`}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-sky-300 hover:bg-sky-50/60"
            >
              <span className="font-medium text-slate-900">{row.label}</span>
              {row.billing.phone ? (
                <span className="mt-0.5 block text-xs text-slate-500 tabular-nums">
                  {formatPhoneForDisplay(row.billing.phone)}
                </span>
              ) : null}
              {row.billing.email ? (
                <span className="block text-xs text-slate-500">{row.billing.email}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PrivatePayRecipientPicker({
  open,
  busy,
  onClose,
  onSelect,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSelect: (recipient: PrivatePayRecipient) => void;
}) {
  const [step, setStep] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PrivatePayRecipientSearchResult | null>(null);
  const [duplicateRecipient, setDuplicateRecipient] = useState<PrivatePayRecipient | null>(null);
  const [form, setForm] = useState<PrivatePayCustomerInput>(emptyCustomerForm);
  const [phoneDisplay, setPhoneDisplay] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("search");
      setQuery("");
      setResults(null);
      setError(null);
      setDuplicateRecipient(null);
      setForm(emptyCustomerForm());
      setPhoneDisplay("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || step !== "search") return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }

    const handle = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      setDuplicateRecipient(null);
      try {
        const res = await fetch(`/api/private-pay/search-recipients?q=${encodeURIComponent(q)}`);
        const json = (await res.json().catch(() => ({}))) as PrivatePayRecipientSearchResult & {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || "Search failed");
        }
        setResults({
          contacts: json.contacts ?? [],
          patients: json.patients ?? [],
          leads: json.leads ?? [],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => window.clearTimeout(handle);
  }, [open, step, query]);

  async function saveNewCustomer() {
    const validated = validatePrivatePayCustomerInput({ ...form, phone: phoneDisplay });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setSaving(true);
    setError(null);
    setDuplicateRecipient(null);
    try {
      const res = await fetch("/api/private-pay/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.normalized),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        recipient?: PrivatePayRecipient;
        error?: string;
        duplicate_recipient?: PrivatePayRecipient | null;
      };

      if (!res.ok || !json.ok || !json.recipient) {
        if (json.duplicate_recipient) {
          setDuplicateRecipient(json.duplicate_recipient);
        }
        throw new Error(json.error || "Failed to create customer");
      }
      onSelect(json.recipient);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const pickerBusy = busy || saving;
  const hasResults =
    results &&
    (results.contacts.length > 0 || results.patients.length > 0 || results.leads.length > 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {step === "create" ? "Add new private-pay customer" : "Who is this invoice for?"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {step === "create"
                ? "Walk-in or call-in clients do not need a patient or lead chart."
                : "Search existing CRM records, or add a new private-pay customer."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pickerBusy}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {step === "search" ? (
          <div className="space-y-4 px-5 py-4">
            <label className={labelCls}>
              Search existing customer, patient, lead, or contact
              <input
                className={inputCls}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, phone, or email"
                autoFocus
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
            ) : null}

            {searching ? <p className="text-sm text-slate-500">Searching…</p> : null}

            {!searching && query.trim().length >= 2 && !hasResults && !error ? (
              <p className="text-sm text-slate-500">No contacts, patients, or leads matched.</p>
            ) : null}

            {hasResults && results ? (
              <div className="max-h-[40vh] space-y-4 overflow-y-auto">
                <ResultGroup title="Patients" rows={results.patients} onSelect={onSelect} />
                <ResultGroup title="Leads" rows={results.leads} onSelect={onSelect} />
                <ResultGroup title="Contacts" rows={results.contacts} onSelect={onSelect} />
              </div>
            ) : null}

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-sm font-medium text-slate-800">Can&apos;t find them?</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Add a private-pay customer without creating a patient or lead intake chart.
              </p>
              <button
                type="button"
                disabled={pickerBusy}
                onClick={() => {
                  setStep("create");
                  setError(null);
                  setDuplicateRecipient(null);
                  const parts = query.trim().split(/\s+/).filter(Boolean);
                  setForm({
                    ...emptyCustomerForm(),
                    first_name: parts[0] ?? "",
                    last_name: parts.slice(1).join(" "),
                  });
                }}
                className="mt-3 rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                + Add new private-pay customer
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                First name
                <input
                  className={inputCls}
                  value={form.first_name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </label>
              <label className={labelCls}>
                Last name
                <input
                  className={inputCls}
                  value={form.last_name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </label>
            </div>
            <label className={labelCls}>
              Phone
              <FormattedPhoneInput
                className={inputCls}
                value={phoneDisplay}
                onValueChange={setPhoneDisplay}
                autoComplete="tel"
                placeholder="(480) 360-0008"
              />
            </label>
            <label className={labelCls}>
              Email
              <input
                type="email"
                className={inputCls}
                value={form.email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="optional"
              />
            </label>
            <label className={labelCls}>
              Address line 1
              <input
                className={inputCls}
                value={form.address_line_1 ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, address_line_1: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              Address line 2
              <input
                className={inputCls}
                value={form.address_line_2 ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, address_line_2: e.target.value }))}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>
                City
                <input
                  className={inputCls}
                  value={form.city ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </label>
              <label className={labelCls}>
                State
                <input
                  className={inputCls}
                  value={form.state ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                />
              </label>
              <label className={labelCls}>
                ZIP
                <input
                  className={inputCls}
                  value={form.zip ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                />
              </label>
            </div>
            <label className={labelCls}>
              Notes (optional)
              <textarea
                className={inputCls}
                rows={2}
                value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Call-in details, billing notes — not clinical/PHI."
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
            ) : null}

            {duplicateRecipient ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p>This phone is already on file as {duplicateRecipient.label}.</p>
                <button
                  type="button"
                  className="mt-2 font-semibold text-amber-900 underline"
                  onClick={() => onSelect(duplicateRecipient)}
                >
                  Use existing contact
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                disabled={pickerBusy}
                onClick={() => {
                  setStep("search");
                  setError(null);
                  setDuplicateRecipient(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to search
              </button>
              <button
                type="button"
                disabled={pickerBusy}
                onClick={saveNewCustomer}
                className="rounded-lg border border-emerald-700 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save & continue to invoice"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
