"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { searchPatientIntakeRecordsAction } from "@/app/admin/crm/actions";
import { convertLeadToPatient } from "@/app/admin/phone/actions";
import type { PatientIntakeSearchResult } from "@/lib/crm/patient-intake-conversion-search";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

function formatConvertError(code: string): string {
  switch (code) {
    case "already_patient_stage":
    case "already_converted":
      return "This lead is already a patient.";
    case "lead_dead":
      return "This lead is marked dead and cannot be converted.";
    case "forbidden":
      return "Not allowed.";
    case "insert_failed":
    case "update_failed":
      return "Could not create or update records.";
    case "load_failed":
    case "lead_not_found":
      return "Lead not found.";
    default:
      return code || "Something went wrong.";
  }
}

function IntakeResultRow({
  row,
  onConvert,
  convertingLeadId,
  convertError,
}: {
  row: PatientIntakeSearchResult;
  onConvert: (leadId: string) => void;
  convertingLeadId: string | null;
  convertError: string | null;
}) {
  const isConverting = convertingLeadId === row.leadId;

  return (
    <li className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-slate-950">{row.displayName}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
              {row.sourceLabel}
            </span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900 ring-1 ring-sky-200/80">
              {row.statusLabel}
            </span>
            {row.crmStage ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold capitalize text-violet-900 ring-1 ring-violet-200/80">
                {row.crmStage}
              </span>
            ) : null}
          </div>

          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
              <dd className="tabular-nums text-slate-800">{formatPhoneForDisplay(row.primaryPhone ?? "") || "—"}</dd>
            </div>
            {row.secondaryPhone ? (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Caregiver / alt</dt>
                <dd className="tabular-nums text-slate-800">{formatPhoneForDisplay(row.secondaryPhone)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Payer</dt>
              <dd className="text-slate-800">
                {[row.payerName, row.payerType].filter(Boolean).join(" · ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Disciplines</dt>
              <dd className="text-slate-800">{row.disciplines.length > 0 ? row.disciplines.join(", ") : "—"}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Referral source</dt>
              <dd className="text-slate-800">{row.referralSource ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {row.isExistingPatient && row.patientId ? (
            <Link
              href={`/admin/crm/patients/${row.patientId}`}
              className="inline-flex items-center justify-center rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              View existing patient
            </Link>
          ) : row.canConvert && row.leadId ? (
            <button
              type="button"
              disabled={Boolean(convertingLeadId)}
              onClick={() => onConvert(row.leadId)}
              className="inline-flex items-center justify-center rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {isConverting ? "Converting…" : "Create patient from this lead"}
            </button>
          ) : (
            <span className="text-xs text-slate-500">Cannot convert</span>
          )}
          {row.leadId ? (
            <Link
              href={`/admin/crm/leads/${row.leadId}`}
              className="text-center text-[11px] font-semibold text-sky-800 hover:underline"
            >
              Open lead intake
            </Link>
          ) : null}
        </div>
      </div>
      {isConverting && convertError ? <p className="mt-2 text-sm text-red-700">{convertError}</p> : null}
    </li>
  );
}

export function PatientIntakeSearchPanel() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientIntakeSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();

  const runSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    startSearch(async () => {
      setSearchError(null);
      try {
        const rows = await searchPatientIntakeRecordsAction(trimmed);
        setResults(rows);
      } catch {
        setSearchError("Search failed. Try again.");
        setResults([]);
      }
    });
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => runSearch(query), 300);
    return () => window.clearTimeout(handle);
  }, [query, runSearch]);

  async function handleConvert(leadId: string) {
    setConvertingLeadId(leadId);
    setConvertError(null);
    const res = await convertLeadToPatient(leadId);
    setConvertingLeadId(null);
    if (!res.ok) {
      setConvertError(formatConvertError(res.error));
      return;
    }
    const q = new URLSearchParams({
      crmStageMoved: "1",
      leadId,
      prevStage: res.previousStage,
    });
    router.push(`/admin/crm/patients/${res.patientId}?${q.toString()}`);
  }

  return (
    <section className="space-y-4 rounded-[28px] border border-sky-200/80 bg-gradient-to-br from-sky-50/50 to-white p-5 shadow-sm ring-1 ring-sky-100/70">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Search &amp; convert from intake</h2>
        <p className="mt-1 text-sm text-slate-600">
          Search leads and contacts by name, phone, payer, referral source, or Medicare/MBI number. One click creates
          the patient chart with intake data carried over.
        </p>
      </div>

      <label className="block">
        <span className="sr-only">Search intake records</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, phone, payer, referral source, Medicare/MBI…"
          className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          autoComplete="off"
        />
      </label>

      {query.trim().length > 0 && query.trim().length < 2 ? (
        <p className="text-sm text-slate-500">Type at least 2 characters to search.</p>
      ) : null}

      {isSearching ? <p className="text-sm text-slate-500">Searching…</p> : null}
      {searchError ? <p className="text-sm text-red-700">{searchError}</p> : null}

      {!isSearching && query.trim().length >= 2 && results.length === 0 && !searchError ? (
        <p className="text-sm text-slate-500">
          No matching leads or contacts. Try a different name, phone, or payer — or create manually below.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="space-y-3">
          {results.map((row) => (
            <IntakeResultRow
              key={row.leadId || row.patientId || row.contactId}
              row={row}
              onConvert={(id) => void handleConvert(id)}
              convertingLeadId={convertingLeadId}
              convertError={convertError}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
