"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { clearStaffApplicantLink, setStaffApplicantLink } from "./actions";

import type { ApplicantSearchRow } from "@/lib/admin/applicant-search-types";

function PendingSubmit({
  children,
  disabled,
  className,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={className}>
      {children}
    </button>
  );
}

type Props = {
  staffProfileId: string;
  staffEmail: string;
  applicantId: string | null;
  linkedName: string | null;
  linkedEmail: string | null;
  hasContract: boolean;
  payrollReady: boolean;
  suggestedApplicantId: string | null;
  suggestedName: string | null;
  suggestedEmail: string | null;
};

function pillClass(ok: boolean): string {
  return ok
    ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80"
    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80";
}

function labelFor(r: ApplicantSearchRow): string {
  const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  return name || r.email || "Unnamed";
}

export function PayrollStaffLinkDialog({
  staffProfileId,
  staffEmail,
  applicantId,
  linkedName,
  linkedEmail,
  hasContract,
  payrollReady,
  suggestedApplicantId,
  suggestedName,
  suggestedEmail,
}: Props) {
  const titleId = useId();
  const searchId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApplicantSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApplicantSearchRow | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSelected(null);
    setFetchErr(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      (async () => {
        setLoading(true);
        setFetchErr(null);
        try {
          const u = new URL("/api/admin/applicants/search", window.location.origin);
          u.searchParams.set("q", query.trim());
          const res = await fetch(u.toString());
          if (!res.ok) {
            throw new Error("Search failed.");
          }
          const body = (await res.json()) as { applicants?: ApplicantSearchRow[] };
          if (!cancelled) {
            setResults(body.applicants ?? []);
          }
        } catch {
          if (!cancelled) {
            setFetchErr("Could not load applicants.");
            setResults([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open || applicantId) return;
    if (staffEmail.trim().length > 0) {
      setQuery(staffEmail.trim());
    }
  }, [open, applicantId, staffEmail]);

  const suggestionRow = useMemo((): ApplicantSearchRow | null => {
    if (!suggestedApplicantId || !suggestedName) return null;
    return {
      id: suggestedApplicantId,
      first_name: suggestedName,
      last_name: "",
      email: suggestedEmail,
    };
  }, [suggestedApplicantId, suggestedName, suggestedEmail]);

  const showNoApplicantWarn = !applicantId;
  const showNoContractWarn = Boolean(applicantId) && !hasContract;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillClass(Boolean(applicantId))}`}
          title="Staff login linked to an applicant (employee) record"
        >
          {applicantId ? "Linked" : "Not linked"}
        </span>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillClass(hasContract)}`}
          title="At least one employee_contracts row for this applicant"
        >
          {hasContract ? "Contract" : "No contract"}
        </span>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillClass(payrollReady)}`}
          title="Linked applicant and contract row"
        >
          {payrollReady ? "Payroll ready" : "Not ready"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100/90"
      >
        Payroll setup
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-indigo-100/90 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-bold text-slate-900">
              Payroll setup
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Link this staff login to an employee (applicant) record for payroll and visit pay. Each applicant can only
              be linked to one staff login.
            </p>

            <div className="mt-4 space-y-2 rounded-[16px] border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-800">
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillClass(Boolean(applicantId))}`}>
                  {applicantId ? "Linked" : "Not linked"}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillClass(hasContract)}`}>
                  {hasContract ? "Contract on file" : "No contract"}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pillClass(payrollReady)}`}>
                  {payrollReady ? "Payroll ready" : "Not ready"}
                </span>
              </div>
              {applicantId ? (
                <dl className="grid gap-1 font-medium">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Employee</dt>
                    <dd>{linkedName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Email</dt>
                    <dd className="break-all">{linkedEmail ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Applicant ID</dt>
                    <dd className="break-all font-mono text-[11px] text-slate-700">{applicantId}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-slate-600">No employee record linked yet.</p>
              )}
            </div>

            {showNoApplicantWarn ? (
              <p className="mt-3 rounded-[14px] border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                Link an employee record so payroll can match visits and contracts to this login.
              </p>
            ) : null}
            {showNoContractWarn ? (
              <p className="mt-2 rounded-[14px] border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                This applicant has no contract row yet. Payroll will not be ready until a contract exists in the system.
              </p>
            ) : null}

            {suggestionRow && !applicantId ? (
              <div className="mt-3 rounded-[14px] border border-sky-200 bg-sky-50/90 px-3 py-2 text-xs text-sky-950">
                <p className="font-semibold">Suggested match (same email as work email)</p>
                <p className="mt-1 text-sky-900">
                  {labelFor(suggestionRow)}
                  {suggestionRow.email ? <span className="text-sky-800"> · {suggestionRow.email}</span> : null}
                </p>
                <button
                  type="button"
                  className="mt-2 rounded-full bg-sky-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-sky-800"
                  onClick={() => setSelected(suggestionRow)}
                >
                  Use suggested employee
                </button>
              </div>
            ) : null}

            <div className="mt-4">
              <label htmlFor={searchId} className="text-[11px] font-semibold text-slate-700">
                Link employee
              </label>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
                autoComplete="off"
              />
              <p className="mt-1 text-[10px] text-slate-500">Results update as you type.</p>
            </div>

            {fetchErr ? <p className="mt-2 text-xs text-red-700">{fetchErr}</p> : null}

            <div className="mt-2 max-h-48 overflow-y-auto rounded-[14px] border border-slate-200 bg-white">
              {loading ? (
                <p className="px-3 py-3 text-xs text-slate-500">Loading…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-xs text-slate-500">No matches. Try another name or email.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {results.map((r) => {
                    const active = selected?.id === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(r)}
                          className={`w-full px-3 py-2 text-left text-xs transition hover:bg-indigo-50/80 ${
                            active ? "bg-indigo-50 font-semibold text-indigo-950" : "text-slate-800"
                          }`}
                        >
                          <span className="block">{labelFor(r)}</span>
                          <span className="block text-[11px] text-slate-600">{r.email ?? "—"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selected ? (
              <p className="mt-2 text-[11px] text-slate-700">
                Selected: <span className="font-semibold">{labelFor(selected)}</span>
                {selected.email ? <span className="text-slate-600"> · {selected.email}</span> : null}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <form action={setStaffApplicantLink} className="inline">
                <input type="hidden" name="staffProfileId" value={staffProfileId} />
                <input type="hidden" name="applicantId" value={selected?.id ?? ""} />
                <PendingSubmit
                  disabled={!selected}
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {applicantId ? "Change linked employee" : "Link employee"}
                </PendingSubmit>
              </form>

              {applicantId ? (
                <form action={clearStaffApplicantLink} className="inline">
                  <input type="hidden" name="staffProfileId" value={staffProfileId} />
                  <PendingSubmit className="inline-flex w-full items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50 sm:w-auto">
                    Clear link
                  </PendingSubmit>
                </form>
              ) : null}

              <button
                type="button"
                onClick={close}
                className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:ml-auto sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
