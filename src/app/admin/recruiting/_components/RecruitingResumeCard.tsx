"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ParsedResumeSuggestions, ResumeExtractionMethod, ResumeParseQuality } from "@/lib/recruiting/resume-parse-types";
import { RESUME_HARD_ERROR_INVALID_FILE, RESUME_SOFT_MANUAL_PARSE_PROFILE } from "@/lib/recruiting/resume-upload-mime";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

import { RecruitingResumeSuggestionsPanel } from "./RecruitingResumeSuggestionsPanel";

const btnGhost =
  "inline-flex min-h-[2.35rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-xs";

function formatResumeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function extractionMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return method.replace(/_/g, " ");
}

type ParsePayload = {
  ok: boolean;
  suggestions: ParsedResumeSuggestions | null;
  warning?: string;
  messages?: string[];
  quality?: ResumeParseQuality;
  extractionMethod?: ResumeExtractionMethod;
  confidenceWarnings?: string[];
  parseNotes?: string[];
  textPreview?: string;
  needsReview?: boolean;
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

type RecruitingResumeCardProps = {
  candidateId: string;
  resumeFileName: string | null;
  resumeStoragePath: string | null;
  resumeUploadedAt: string | null;
  resumeExtractionMethod?: string | null;
  resumeParseWarnings?: string | null;
  resumeParseNotes?: string | null;
  resumeExtractedCleanText?: string | null;
  candidate: CandidateSnapshot;
};

export function RecruitingResumeCard({
  candidateId,
  resumeFileName,
  resumeStoragePath,
  resumeUploadedAt,
  resumeExtractionMethod,
  resumeParseWarnings,
  resumeParseNotes,
  resumeExtractedCleanText,
  candidate,
}: RecruitingResumeCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [reparsePending, startReparse] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; message: string } | null>(null);
  const [parse, setParse] = useState<ParsePayload | null>(null);
  const [panelKey, setPanelKey] = useState(0);
  const [showExtractedText, setShowExtractedText] = useState(false);

  const hasResume = Boolean(resumeStoragePath?.trim());

  const activeTextPreview = parse?.textPreview ?? resumeExtractedCleanText?.slice(0, 2500) ?? null;
  const activeWarnings =
    parse?.confidenceWarnings ??
    (resumeParseWarnings ? resumeParseWarnings.split("\n").filter(Boolean) : []);
  const activeParseNotes = parse?.parseNotes ?? (resumeParseNotes ? resumeParseNotes.split("\n").filter(Boolean) : []);
  const activeMethod = parse?.extractionMethod ?? resumeExtractionMethod ?? null;

  const viewHref = `/api/recruiting/resume/${encodeURIComponent(candidateId)}?mode=view`;
  const downloadHref = `/api/recruiting/resume/${encodeURIComponent(candidateId)}?mode=download`;

  function openPicker() {
    setToast(null);
    inputRef.current?.click();
  }

  function dismissSuggestions() {
    setParse(null);
    router.refresh();
  }

  function onReplaceResume() {
    setParse(null);
    router.refresh();
    setTimeout(() => openPicker(), 0);
  }

  function onReparse() {
    setToast(null);
    startReparse(async () => {
      try {
        const res = await fetch("/api/recruiting/resume/reparse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; parse?: ParsePayload };
        if (!res.ok) {
          setToast({ kind: "err", message: json.error || "Re-parse failed." });
          return;
        }
        const p = json.parse;
        setParse(p ?? null);
        setPanelKey((k) => k + 1);
        setToast({
          kind: "ok",
          message: p?.needsReview
            ? "Resume re-parsed — text may need review. See suggestions below."
            : "Resume re-parsed — review suggestions below.",
        });
        router.refresh();
      } catch {
        setToast({ kind: "err", message: "Network error — try again." });
      }
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const fd = new FormData();
    fd.set("candidateId", candidateId);
    fd.set("file", file);

    startTransition(async () => {
      setToast(null);
      setParse(null);
      try {
        const res = await fetch("/api/recruiting/resume/upload", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          ok?: boolean;
          parse?: ParsePayload;
        };
        if (!res.ok) {
          setToast({
            kind: "err",
            message: json.error || RESUME_HARD_ERROR_INVALID_FILE,
          });
          return;
        }
        const wasReplace = hasResume;
        const p = json.parse;
        setParse(p ?? null);
        setPanelKey((k) => k + 1);

        const q = p?.quality;
        const ocrHint = q === "ocr_success" || q === "ocr_limited";
        const reviewHint = p?.needsReview || q === "needs_review";
        if (p?.ok) {
          setToast({
            kind: "ok",
            message: reviewHint
              ? "Resume uploaded — text may need review. Check suggestions below."
              : ocrHint
                ? wasReplace
                  ? "Resume replaced — text was read with OCR; review suggestions below."
                  : "Resume uploaded — text was read with OCR; review suggestions below."
                : wasReplace
                  ? "Resume replaced — review suggestions below."
                  : "Resume uploaded — review suggestions below.",
          });
        } else {
          setToast({
            kind: "ok",
            message: wasReplace
              ? `Resume replaced. ${RESUME_SOFT_MANUAL_PARSE_PROFILE}`
              : RESUME_SOFT_MANUAL_PARSE_PROFILE,
          });
        }
        router.refresh();
      } catch {
        setToast({ kind: "err", message: "Network error — try again." });
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-gradient-to-br from-white via-sky-50/30 to-cyan-50/25 shadow-sm ring-1 ring-sky-100/40">
        <div className="border-b border-slate-100/90 bg-gradient-to-r from-sky-50/80 to-cyan-50/40 px-5 py-4 sm:px-6">
          <h3 className="text-sm font-semibold tracking-tight text-slate-900">Resume</h3>
          <p className="mt-1 text-xs text-slate-600">
            PDF, Word (.doc / .docx), up to 10 MB. Text-based PDFs are read directly; scanned files use OCR when needed.
          </p>
        </div>

        <div className="px-5 py-5 sm:px-6">
          {toast ? (
            <div
              className={`mb-4 rounded-xl border px-3 py-2 text-sm font-medium ${
                toast.kind === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
              role="status"
            >
              {toast.message}
            </div>
          ) : null}

          {activeWarnings.length > 0 ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <ul className="list-disc space-y-1 pl-4">
                {activeWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={onFileChange}
          />

          {!hasResume ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No resume uploaded yet</p>
              <p className="mt-1 text-xs text-slate-500">Upload a file to keep hiring context in one place.</p>
              <button type="button" className={`${crmPrimaryCtaCls} mt-4`} disabled={pending} onClick={openPicker}>
                {pending ? "Uploading…" : "Upload resume"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-100 bg-white/90 px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current file</div>
                <div className="mt-1 break-all text-sm font-semibold text-slate-900">{resumeFileName ?? "Resume"}</div>
                <div className="mt-1 text-xs text-slate-500">Uploaded {formatResumeDate(resumeUploadedAt)}</div>
                {activeMethod ? (
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Extraction: {extractionMethodLabel(activeMethod)}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <a href={viewHref} target="_blank" rel="noreferrer" className={btnGhost}>
                  View
                </a>
                <a href={downloadHref} className={btnGhost}>
                  Download
                </a>
                <button type="button" className={btnGhost} disabled={reparsePending || pending} onClick={onReparse}>
                  {reparsePending ? "Re-parsing…" : "Re-parse resume"}
                </button>
                <button type="button" className={crmPrimaryCtaCls} disabled={pending} onClick={openPicker}>
                  {pending ? "Working…" : "Replace resume"}
                </button>
              </div>

              {activeTextPreview ? (
                <div className="rounded-2xl border border-slate-100 bg-white/90 px-4 py-3 shadow-sm">
                  <button
                    type="button"
                    className="text-[11px] font-semibold uppercase tracking-wide text-sky-800"
                    onClick={() => setShowExtractedText((v) => !v)}
                  >
                    {showExtractedText ? "Hide extracted text" : "View extracted text"}
                  </button>
                  {showExtractedText ? (
                    <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[11px] leading-relaxed text-slate-800">
                      {activeTextPreview}
                    </pre>
                  ) : null}
                  {activeParseNotes.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-[11px] text-slate-600">
                      {activeParseNotes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {parse ? (
        <RecruitingResumeSuggestionsPanel
          key={panelKey}
          candidateId={candidateId}
          parseOk={parse.ok}
          parseWarning={parse.warning}
          confidenceWarnings={parse.confidenceWarnings}
          suggestions={parse.suggestions}
          current={candidate}
          onDismiss={dismissSuggestions}
          onReplaceResume={onReplaceResume}
        />
      ) : null}
    </div>
  );
}
