"use client";

import { useEffect, useState } from "react";

import { formatFacilityDate } from "@/lib/crm/facility-address";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

export type FacilityPickerItem = {
  id: string;
  name: string;
  type: string | null;
  city: string | null;
  address: string;
  phone: string | null;
  lastVisitAt: string | null;
};

type FacilityPickerModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (facility: FacilityPickerItem) => void;
};

export function FacilityPickerModal({
  open,
  title = "Choose a facility",
  onClose,
  onSelect,
}: FacilityPickerModalProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<FacilityPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
      setResults([]);
      setError(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetch("/api/facilities/picker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: debounced }),
    })
      .then((r) => r.json())
      .then((data: { ok: boolean; results?: FacilityPickerItem[]; error?: string }) => {
        if (cancelled) return;
        if (!data.ok) {
          setError("Search failed. Try again.");
          setResults([]);
          return;
        }
        setResults(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Search failed. Check your connection.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, debounced]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl">
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Facility search</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{title}</h2>
        </div>

        <div className="shrink-0 px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, city, phone, contact…"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200"
            autoFocus
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {loading ? <p className="py-6 text-center text-sm text-slate-500">Searching…</p> : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}
          {!loading && debounced.trim().length >= 2 && results.length === 0 && !error ? (
            <p className="py-6 text-center text-sm text-slate-500">No facilities match.</p>
          ) : null}
          {debounced.trim().length < 2 && !loading ? (
            <p className="py-6 text-center text-sm text-slate-500">Type at least 2 characters to search.</p>
          ) : null}

          <div className="space-y-2">
            {results.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onSelect(f);
                  onClose();
                }}
                className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:bg-teal-50/40"
              >
                <div className="font-semibold text-slate-900">{f.name}</div>
                <p className="mt-1 text-sm text-slate-600">
                  {[f.type, f.city].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{f.address || "—"}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                  {f.phone ? <span>{formatPhoneForDisplay(f.phone)}</span> : null}
                  <span>Last visit: {f.lastVisitAt ? formatFacilityDate(f.lastVisitAt) : "Never"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
