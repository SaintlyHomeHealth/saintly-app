"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  crmFilterInputCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import {
  RECRUITING_DISCIPLINE_OPTIONS,
  RECRUITING_INTEREST_LEVEL_OPTIONS,
  RECRUITING_PREFERRED_CONTACT_OPTIONS,
  RECRUITING_SOURCE_OPTIONS,
} from "@/lib/recruiting/recruiting-options";
import type { ParsedResumeSuggestions } from "@/lib/recruiting/resume-parse-types";

import { createRecruitingCandidateFromResume } from "../../actions";

function pick(s?: { value: string } | undefined): string {
  return s?.value?.trim() ? s.value.trim() : "";
}

type Step = "pick" | "review";

type ParsePayload = {
  ok: boolean;
  suggestions: ParsedResumeSuggestions | null;
  warning?: string;
};

type NewFromResumeClientProps = {
  initialError: string | null;
};

export function NewFromResumeClient({ initialError }: NewFromResumeClientProps) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("pick");
  const [toast, setToast] = useState<string | null>(initialError);
  const [file, setFile] = useState<File | null>(null);
  const [parse, setParse] = useState<ParsePayload | null>(null);

  const disciplineExtra = useMemo(() => {
    const d = parse?.suggestions?.discipline?.value?.trim() ?? "";
    return d && !(RECRUITING_DISCIPLINE_OPTIONS as readonly string[]).includes(d) ? d : null;
  }, [parse?.suggestions]);

  const defaults = useMemo(() => {
    const s = parse?.suggestions;
    if (!s) {
      return {
        full_name: "",
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        city: "",
        state: "",
        discipline: "",
        notes: "",
        specialties: "",
        coverage_area: "",
        interest_level: "",
        recruiting_tags: "",
        follow_up_bucket: "",
        preferred_contact_method: "",
      };
    }
    const notesParts: string[] = [];
    const summary = pick(s.notes_summary);
    if (summary) notesParts.push(summary);
    const yrs = pick(s.years_of_experience);
    if (yrs) notesParts.push(`Experience: ${yrs}`);
    const cert = pick(s.certifications);
    if (cert) notesParts.push(`Certifications: ${cert}`);

    return {
      full_name: pick(s.full_name) || [pick(s.first_name), pick(s.last_name)].filter(Boolean).join(" "),
      first_name: pick(s.first_name),
      last_name: pick(s.last_name),
      phone: pick(s.phone),
      email: pick(s.email),
      city: pick(s.city),
      state: pick(s.state),
      discipline: pick(s.discipline),
      notes: notesParts.join("\n"),
      specialties: pick(s.specialties),
      coverage_area: "",
      interest_level: "",
      recruiting_tags: "",
      follow_up_bucket: "",
      preferred_contact_method: "",
    };
  }, [parse]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    setToast(null);
    setParse(null);
    if (!f) return;

    setFile(f);
    const fd = new FormData();
    fd.set("file", f);

    startTransition(async () => {
      try {
        const res = await fetch("/api/recruiting/resume/parse-only", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          parse?: ParsePayload;
        };
        if (!res.ok) {
          setToast(json.error || "Could not read that file.");
          setStep("pick");
          return;
        }
        setParse(json.parse ?? { ok: false, suggestions: null });
        setStep("review");
      } catch {
        setToast("Network error — try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {toast}
        </div>
      ) : null}

      {step === "pick" ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-base font-semibold text-slate-900">1. Upload resume</h2>
          <p className="mt-1 text-sm text-slate-600">
            We extract text and suggest name, contact, and discipline. You review before creating the candidate.
          </p>
          <label className="mt-6 block">
            <span className="sr-only">Resume file</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className={`${crmFilterInputCls} cursor-pointer`}
              disabled={pending}
              onChange={onFileChange}
            />
          </label>
          {pending ? <p className="mt-3 text-sm text-slate-600">Reading file…</p> : null}
        </div>
      ) : null}

      {step === "review" && file ? (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            fd.set("file", file);
            startTransition(async () => {
              setToast(null);
              await createRecruitingCandidateFromResume(fd);
            });
          }}
        >
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">2. Review & create</h2>
                <p className="mt-1 text-sm text-slate-600">
                  File: <span className="font-medium text-slate-800">{file.name}</span>
                  {parse?.warning ? (
                    <span className="mt-2 block text-amber-800">Parser note: {parse.warning}</span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                disabled={pending}
                onClick={() => {
                  setStep("pick");
                  setFile(null);
                  setParse(null);
                }}
              >
                Start over
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:col-span-2">
                Full name *
                <input
                  name="full_name"
                  required
                  defaultValue={defaults.full_name}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Phone
                <input name="phone" defaultValue={defaults.phone} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Email
                <input name="email" type="email" defaultValue={defaults.email} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                City
                <input name="city" defaultValue={defaults.city} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                State
                <input name="state" defaultValue={defaults.state} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Coverage area
                <input name="coverage_area" defaultValue={defaults.coverage_area} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Discipline
                <select name="discipline" defaultValue={defaults.discipline} className={crmFilterInputCls}>
                  <option value="">—</option>
                  {disciplineExtra ? (
                    <option value={disciplineExtra}>{disciplineExtra} (parsed)</option>
                  ) : null}
                  {RECRUITING_DISCIPLINE_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Source
                <select name="source" defaultValue="Indeed" className={crmFilterInputCls}>
                  {RECRUITING_SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Interest level
                <select name="interest_level" defaultValue={defaults.interest_level} className={crmFilterInputCls}>
                  <option value="">—</option>
                  {RECRUITING_INTEREST_LEVEL_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Preferred contact
                <select
                  name="preferred_contact_method"
                  defaultValue={defaults.preferred_contact_method}
                  className={crmFilterInputCls}
                >
                  <option value="">—</option>
                  {RECRUITING_PREFERRED_CONTACT_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Specialties
                <input name="specialties" defaultValue={defaults.specialties} className={crmFilterInputCls} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Tags / campaigns (free text)
                <input name="recruiting_tags" defaultValue={defaults.recruiting_tags} className={crmFilterInputCls} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Nurture bucket (e.g. East Valley)
                <input name="follow_up_bucket" defaultValue={defaults.follow_up_bucket} className={crmFilterInputCls} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Notes summary
                <textarea name="notes" rows={5} defaultValue={defaults.notes} className={`${crmFilterInputCls} min-h-[7rem]`} />
              </label>
            </div>

            <input type="hidden" name="first_name" value={defaults.first_name} />
            <input type="hidden" name="last_name" value={defaults.last_name} />

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="submit" disabled={pending} className={crmPrimaryCtaCls}>
                {pending ? "Saving…" : "Create candidate & save resume"}
              </button>
              <Link
                href="/admin/recruiting"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Cancel
              </Link>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
