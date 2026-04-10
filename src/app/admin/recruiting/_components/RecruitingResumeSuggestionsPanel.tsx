"use client";

import { useState, useTransition } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import type { ApplyableResumeField, ParsedResumeSuggestions, ResumeConfidenceLabel } from "@/lib/recruiting/resume-parse-types";

import { applyRecruitingResumeSuggestions } from "../actions";

const btnGhost =
  "inline-flex min-h-[2.35rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-xs";

const CONFIDENCE_PILL: Record<ResumeConfidenceLabel, string> = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-900 ring-emerald-200/80",
  possible: "border-amber-200 bg-amber-50 text-amber-900 ring-amber-200/80",
  review: "border-slate-200 bg-slate-50 text-slate-700 ring-slate-200/80",
};

const CONFIDENCE_LABEL: Record<ResumeConfidenceLabel, string> = {
  high: "High confidence",
  possible: "Possible match",
  review: "Review needed",
};

type CandidateSnapshot = {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  discipline: string | null;
  notes: string | null;
};

type RowConfig = {
  key: ApplyableResumeField;
  label: string;
  multiline?: boolean;
};

const ROWS: RowConfig[] = [
  { key: "full_name", label: "Full name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "discipline", label: "Discipline" },
  { key: "notes_summary", label: "Summary", multiline: true },
  { key: "years_of_experience", label: "Years of experience" },
  { key: "specialties", label: "Specialties", multiline: true },
  { key: "certifications", label: "Certifications", multiline: true },
];

function isBlank(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

function fieldSnapshotKey(k: ApplyableResumeField): keyof CandidateSnapshot | null {
  if (k === "notes_summary" || k === "years_of_experience" || k === "specialties" || k === "certifications") {
    return null;
  }
  return k as keyof CandidateSnapshot;
}

type RecruitingResumeSuggestionsPanelProps = {
  candidateId: string;
  parseOk: boolean;
  parseWarning?: string;
  suggestions: ParsedResumeSuggestions | null;
  current: CandidateSnapshot;
  onDismiss: () => void;
  onReplaceResume: () => void;
};

export function RecruitingResumeSuggestionsPanel({
  candidateId,
  parseOk,
  parseWarning,
  suggestions,
  current,
  onDismiss,
  onReplaceResume,
}: RecruitingResumeSuggestionsPanelProps) {
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);

  const [values, setValues] = useState<Partial<Record<ApplyableResumeField, string>>>(() => {
    const v: Partial<Record<ApplyableResumeField, string>> = {};
    for (const row of ROWS) {
      const sug = suggestions?.[row.key];
      if (sug?.value) v[row.key] = sug.value;
    }
    return v;
  });

  const [overwrite, setOverwrite] = useState<Partial<Record<ApplyableResumeField, boolean>>>({});

  function setField(key: ApplyableResumeField, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function toggleOw(key: ApplyableResumeField) {
    setOverwrite((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function apply() {
    setBanner(null);
    startTransition(async () => {
      const res = await applyRecruitingResumeSuggestions({
        candidateId,
        values,
        overwrite,
      });
      if (!res.ok) {
        setBanner(res.message);
        return;
      }
      onDismiss();
    });
  }

  const hasAnySuggestion = ROWS.some((row) => suggestions?.[row.key]?.value);

  return (
    <div className="overflow-hidden rounded-[28px] border border-sky-200/90 bg-gradient-to-br from-white via-sky-50/40 to-cyan-50/30 shadow-lg shadow-sky-200/30 ring-1 ring-sky-200/50">
      <div className="border-b border-sky-100/90 bg-gradient-to-r from-sky-100/50 to-cyan-50/50 px-5 py-4 sm:px-6">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">Resume suggestions</h3>
        <p className="mt-1 text-xs text-slate-600">
          Review parsed details before applying. We never overwrite existing fields unless you allow it per field.
        </p>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        {!parseOk && parseWarning ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {parseWarning} Your file is still saved — add details manually or try a PDF/DOCX export.
          </div>
        ) : null}

        {parseOk && !hasAnySuggestion ? (
          <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-700">
            No structured fields were detected. Open the resume and enter profile fields manually.
          </div>
        ) : null}

        {banner ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900">
            {banner}
          </div>
        ) : null}

        <div className="space-y-4">
          {ROWS.map((row) => {
            const sug = suggestions?.[row.key];
            if (!sug?.value?.trim()) return null;

            const displayVal = values[row.key] ?? sug.value;
            const snapKey = fieldSnapshotKey(row.key);
            const existing =
              row.key === "notes_summary"
                ? current.notes
                : snapKey
                  ? current[snapKey]
                  : null;
            const hasExisting = !isBlank(existing);
            const conf = sug?.label ?? "review";

            return (
              <div key={row.key} className="rounded-2xl border border-slate-100 bg-white/95 px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{row.label}</span>
                  {sug ? (
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${CONFIDENCE_PILL[conf]}`}
                    >
                      {CONFIDENCE_LABEL[conf]}
                    </span>
                  ) : null}
                </div>
                {row.multiline ? (
                  <textarea
                    className={`${crmFilterInputCls} mt-2 min-h-[4.5rem] w-full`}
                    value={displayVal}
                    onChange={(e) => setField(row.key, e.target.value)}
                  />
                ) : (
                  <input
                    className={`${crmFilterInputCls} mt-2 w-full`}
                    value={displayVal}
                    onChange={(e) => setField(row.key, e.target.value)}
                  />
                )}
                {hasExisting ? (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!overwrite[row.key]}
                      onChange={() => toggleOw(row.key)}
                      className="rounded border-slate-300"
                    />
                    Overwrite existing ({String(existing).slice(0, 48)}
                    {String(existing).length > 48 ? "…" : ""})
                  </label>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">Will fill blank field</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={crmPrimaryCtaCls} disabled={pending} onClick={apply}>
            {pending ? "Applying…" : "Apply suggestions"}
          </button>
          <button type="button" className={btnGhost} disabled={pending} onClick={onDismiss}>
            Dismiss
          </button>
          <button type="button" className={btnGhost} disabled={pending} onClick={onReplaceResume}>
            Replace resume
          </button>
        </div>
      </div>
    </div>
  );
}
