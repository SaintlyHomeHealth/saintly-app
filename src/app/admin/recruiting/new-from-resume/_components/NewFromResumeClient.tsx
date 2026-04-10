"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";

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
import type { RecruitingDuplicateRow } from "@/lib/recruiting/recruiting-duplicates";
import type { ParsedResumeSuggestions, ResumeParseQuality } from "@/lib/recruiting/resume-parse-types";
import {
  RESUME_HARD_ERROR_CHOOSE_FILE,
  RESUME_HARD_ERROR_INVALID_FILE,
  RESUME_HARD_ERROR_TOO_LARGE,
  RESUME_SOFT_MANUAL_PARSE_CREATE,
} from "@/lib/recruiting/resume-upload-mime";

import { attachResumeToExistingCandidate, createRecruitingCandidateFromResume } from "../../actions";
import { RecruitingDuplicateModal } from "../../_components/RecruitingDuplicateModal";

function pick(s?: { value: string } | undefined): string {
  return s?.value?.trim() ? s.value.trim() : "";
}

/** Form field state for review step (controlled inputs — not defaultValue). */
type ReviewFormFields = {
  full_name: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  discipline: string;
  notes: string;
  specialties: string;
  coverage_area: string;
  interest_level: string;
  recruiting_tags: string;
  follow_up_bucket: string;
  preferred_contact_method: string;
  source: string;
};

const EMPTY_REVIEW_FORM: ReviewFormFields = {
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
  source: "Indeed",
};

function buildReviewFormFromSuggestions(s: ParsedResumeSuggestions): ReviewFormFields {
  const notesParts: string[] = [];
  const summary = pick(s.notes_summary);
  if (summary) notesParts.push(summary);
  const yrs = pick(s.years_of_experience);
  if (yrs) notesParts.push(`Experience: ${yrs}`);
  const cert = pick(s.certifications);
  if (cert) notesParts.push(`Certifications: ${cert}`);

  return {
    ...EMPTY_REVIEW_FORM,
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
  };
}

type Step = "pick" | "review";

type ParsePayload = {
  ok: boolean;
  quality: ResumeParseQuality;
  suggestions: ParsedResumeSuggestions | null;
  messages: string[];
  /** Banner title override from API (e.g. scanned PDF without OCR in this environment) */
  statusHeadline?: string;
  /** @deprecated use messages */
  warning?: string;
};

function parseStatusBannerClass(q: ResumeParseQuality): string {
  switch (q) {
    case "parsed_ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "limited_parse":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "ocr_success":
    case "ocr_limited":
      return "border-sky-200 bg-sky-50 text-sky-950";
    case "manual":
      return "border-slate-200 bg-slate-50 text-slate-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-900";
  }
}

function parseStatusTitle(q: ResumeParseQuality, headline?: string | null): string {
  if (headline?.trim()) return headline.trim();
  switch (q) {
    case "parsed_ok":
      return "Parsed successfully";
    case "limited_parse":
      return "Limited parse";
    case "ocr_success":
      return "Image-based resume — OCR used";
    case "ocr_limited":
      return "Image-based resume — OCR used (partial)";
    case "manual":
      return "Could not auto-read enough text — continue manually";
    default:
      return "Parse status";
  }
}

type NewFromResumeClientProps = {
  initialError: string | null;
};

export function NewFromResumeClient({ initialError }: NewFromResumeClientProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("pick");
  const [toast, setToast] = useState<string | null>(initialError);
  const [file, setFile] = useState<File | null>(null);
  const [parse, setParse] = useState<ParsePayload | null>(null);
  const [dupes, setDupes] = useState<RecruitingDuplicateRow[] | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormFields>(EMPTY_REVIEW_FORM);

  /** Sync controlled fields when parse result arrives (defaultValue would not update). */
  useLayoutEffect(() => {
    if (parse?.suggestions) {
      setReviewForm(buildReviewFormFromSuggestions(parse.suggestions));
    } else {
      setReviewForm(EMPTY_REVIEW_FORM);
    }
  }, [parse]);

  const disciplineExtra = useMemo(() => {
    const d = reviewForm.discipline.trim();
    return d && !(RECRUITING_DISCIPLINE_OPTIONS as readonly string[]).includes(d) ? d : null;
  }, [reviewForm.discipline]);

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
          ok?: boolean;
          resume_file_name?: string;
          error?: string;
          parse?: ParsePayload;
        };

        const isDev = process.env.NODE_ENV === "development";
        if (isDev) {
          console.log("[new-from-resume] parse-only full API response", json);
          console.log("[new-from-resume] json.parse", json.parse);
          console.log("[new-from-resume] json.parse?.suggestions", json.parse?.suggestions);
        }

        /** Only true validation / auth failures block the flow (red banner, stay on upload step). */
        if (res.status === 403) {
          setToast(json.error ?? "You do not have access to this action.");
          setStep("pick");
          return;
        }
        if (res.status === 400) {
          setToast(json.error ?? "Invalid file — check type and size (max 10 MB).");
          setStep("pick");
          return;
        }

        if (!res.ok) {
          if (isDev) {
            console.warn("[new-from-resume] non-2xx but continuing with manual review", res.status, json);
          }
          setToast(null);
          setParse(
            json.parse ?? {
              ok: false,
              quality: "manual",
              suggestions: null,
              messages: [RESUME_SOFT_MANUAL_PARSE_CREATE],
            }
          );
          setStep("review");
          return;
        }

        setParse(
          json.parse ?? {
            ok: false,
            quality: "manual",
            suggestions: null,
            messages: [RESUME_SOFT_MANUAL_PARSE_CREATE],
          }
        );
        setStep("review");
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.error("[new-from-resume] parse-only fetch failed", e);
        }
        setToast("Network error — try again.");
      }
    });
  }

  function mapResumeCreateError(reason: string): string {
    switch (reason) {
      case "missing_name":
        return "Full name is required.";
      case "missing_file":
        return RESUME_HARD_ERROR_CHOOSE_FILE;
      case "file_too_large":
        return RESUME_HARD_ERROR_TOO_LARGE;
      case "bad_type":
        return RESUME_HARD_ERROR_INVALID_FILE;
      case "save_failed":
        return "Could not save the candidate.";
      case "upload_failed":
        return "Resume upload failed — try again.";
      default:
        return "Something went wrong.";
    }
  }

  function runCreateFromResume(forceDuplicate: boolean) {
    if (!formRef.current || !file) return;
    const fd = new FormData(formRef.current);
    fd.set("file", file);
    if (forceDuplicate) fd.set("force_duplicate", "1");
    startTransition(async () => {
      setToast(null);
      const res = await createRecruitingCandidateFromResume(fd);
      if (res.ok) {
        setDupes(null);
        router.push(`/admin/recruiting/${res.candidateId}`);
        return;
      }
      if (res.reason === "duplicates") {
        setDupes(res.duplicates);
        return;
      }
      setToast(mapResumeCreateError(res.reason));
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
          ref={formRef}
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            runCreateFromResume(false);
          }}
        >
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">2. Review & create</h2>
                <p className="mt-1 text-sm text-slate-600">
                  File: <span className="font-medium text-slate-800">{file.name}</span>
                </p>
                {parse ? (
                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-sm ${parseStatusBannerClass(parse.quality)}`}
                    role="status"
                  >
                    <p className="font-semibold">{parseStatusTitle(parse.quality, parse.statusHeadline)}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {(parse.messages?.length ? parse.messages : parse.warning ? [parse.warning] : []).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {process.env.NODE_ENV === "development" && parse?.suggestions ? (
                  <div className="mt-4 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-left">
                    <p className="text-xs font-semibold text-amber-900">Debug (dev): raw suggestions received by client</p>
                    <pre className="mt-2 max-h-48 overflow-auto text-[11px] leading-snug text-amber-950">
                      {JSON.stringify(parse.suggestions, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                disabled={pending}
                onClick={() => {
                  setStep("pick");
                  setFile(null);
                  setParse(null);
                  setReviewForm(EMPTY_REVIEW_FORM);
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
                  value={reviewForm.full_name}
                  onChange={(e) => setReviewForm((p) => ({ ...p, full_name: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Phone
                <input
                  name="phone"
                  value={reviewForm.phone}
                  onChange={(e) => setReviewForm((p) => ({ ...p, phone: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Email
                <input
                  name="email"
                  type="email"
                  value={reviewForm.email}
                  onChange={(e) => setReviewForm((p) => ({ ...p, email: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                City
                <input
                  name="city"
                  value={reviewForm.city}
                  onChange={(e) => setReviewForm((p) => ({ ...p, city: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                State
                <input
                  name="state"
                  value={reviewForm.state}
                  onChange={(e) => setReviewForm((p) => ({ ...p, state: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Coverage area
                <input
                  name="coverage_area"
                  value={reviewForm.coverage_area}
                  onChange={(e) => setReviewForm((p) => ({ ...p, coverage_area: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Discipline
                <select
                  name="discipline"
                  value={reviewForm.discipline}
                  onChange={(e) => setReviewForm((p) => ({ ...p, discipline: e.target.value }))}
                  className={crmFilterInputCls}
                >
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
                <select
                  name="source"
                  value={reviewForm.source}
                  onChange={(e) => setReviewForm((p) => ({ ...p, source: e.target.value }))}
                  className={crmFilterInputCls}
                >
                  {RECRUITING_SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Interest level
                <select
                  name="interest_level"
                  value={reviewForm.interest_level}
                  onChange={(e) => setReviewForm((p) => ({ ...p, interest_level: e.target.value }))}
                  className={crmFilterInputCls}
                >
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
                  value={reviewForm.preferred_contact_method}
                  onChange={(e) => setReviewForm((p) => ({ ...p, preferred_contact_method: e.target.value }))}
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
                <input
                  name="specialties"
                  value={reviewForm.specialties}
                  onChange={(e) => setReviewForm((p) => ({ ...p, specialties: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Tags / campaigns (free text)
                <input
                  name="recruiting_tags"
                  value={reviewForm.recruiting_tags}
                  onChange={(e) => setReviewForm((p) => ({ ...p, recruiting_tags: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Nurture bucket (e.g. East Valley)
                <input
                  name="follow_up_bucket"
                  value={reviewForm.follow_up_bucket}
                  onChange={(e) => setReviewForm((p) => ({ ...p, follow_up_bucket: e.target.value }))}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Notes summary
                <textarea
                  name="notes"
                  rows={5}
                  value={reviewForm.notes}
                  onChange={(e) => setReviewForm((p) => ({ ...p, notes: e.target.value }))}
                  className={`${crmFilterInputCls} min-h-[7rem]`}
                />
              </label>
            </div>

            <input type="hidden" name="first_name" value={reviewForm.first_name} />
            <input type="hidden" name="last_name" value={reviewForm.last_name} />

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

      <RecruitingDuplicateModal
        open={Boolean(dupes?.length)}
        title="Existing candidate found"
        duplicates={dupes ?? []}
        resumeFile={file}
        pending={pending}
        onOpenCandidate={(id) => {
          setDupes(null);
          router.push(`/admin/recruiting/${id}`);
        }}
        onContinueAnyway={() => {
          setDupes(null);
          runCreateFromResume(true);
        }}
        onAttachResumeTo={(candidateId) => {
          if (!file) return;
          const fd = new FormData();
          fd.set("candidateId", candidateId);
          fd.set("file", file);
          startTransition(async () => {
            const r = await attachResumeToExistingCandidate(fd);
            if (r.ok) {
              setDupes(null);
              router.push(`/admin/recruiting/${candidateId}`);
              return;
            }
            setToast(r.reason);
          });
        }}
        onCancel={() => setDupes(null)}
      />
    </div>
  );
}
