"use client";

import { useEffect, useState } from "react";

import type { PrivatePayRecipient, PrivatePayRecipientSearchResult } from "@/lib/private-pay/types";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

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
                <span className="mt-0.5 block text-xs text-slate-500">{row.billing.phone}</span>
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
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PrivatePayRecipientSearchResult | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }

    const handle = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
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
  }, [open, query]);

  if (!open) return null;

  const hasResults =
    results &&
    (results.contacts.length > 0 || results.patients.length > 0 || results.leads.length > 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Who is this invoice for?</h3>
            <p className="mt-0.5 text-xs text-slate-500">Search by name, phone, or email (min. 2 characters).</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <input
            className={inputCls}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Jennifer"
            autoFocus
          />

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
          ) : null}

          {searching ? <p className="text-sm text-slate-500">Searching…</p> : null}

          {!searching && query.trim().length >= 2 && !hasResults && !error ? (
            <p className="text-sm text-slate-500">No contacts, patients, or leads matched.</p>
          ) : null}

          {hasResults && results ? (
            <div className="max-h-[50vh] space-y-4 overflow-y-auto">
              <ResultGroup title="Patients" rows={results.patients} onSelect={onSelect} />
              <ResultGroup title="Leads" rows={results.leads} onSelect={onSelect} />
              <ResultGroup title="Contacts" rows={results.contacts} onSelect={onSelect} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
