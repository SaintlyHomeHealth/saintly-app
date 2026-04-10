"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ParsedResumeSuggestions } from "@/lib/recruiting/resume-parse-types";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";

import { RecruitingResumeSuggestionsPanel } from "./RecruitingResumeSuggestionsPanel";

const btnGhost =
  "inline-flex min-h-[2.35rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-xs";

function formatResumeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type ParsePayload = {
  ok: boolean;
  suggestions: ParsedResumeSuggestions | null;
  warning?: string;
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
  candidate: CandidateSnapshot;
};

export function RecruitingResumeCard({
  candidateId,
  resumeFileName,
  resumeStoragePath,
  resumeUploadedAt,
  candidate,
}: RecruitingResumeCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; message: string } | null>(null);
  const [parse, setParse] = useState<ParsePayload | null>(null);
  const [panelKey, setPanelKey] = useState(0);

  const hasResume = Boolean(resumeStoragePath?.trim());

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
          setToast({ kind: "err", message: json.error || "Upload failed" });
          return;
        }
        const wasReplace = hasResume;
        const p = json.parse;
        setParse(p ?? null);
        setPanelKey((k) => k + 1);

        if (p?.ok) {
          setToast({
            kind: "ok",
            message: wasReplace
              ? "Resume replaced — review suggestions below."
              : "Resume uploaded — review suggestions below.",
          });
        } else {
          setToast({
            kind: "ok",
            message: wasReplace
              ? "Resume replaced. Auto-fill had limited data — you can still edit the profile."
              : "Resume uploaded. Auto-fill had limited data — you can still edit the profile.",
          });
        }
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
          <p className="mt-1 text-xs text-slate-600">PDF, Word (.doc / .docx), up to 10 MB. We parse text for quick profile suggestions.</p>
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
              </div>

              <div className="flex flex-wrap gap-2">
                <a href={viewHref} target="_blank" rel="noreferrer" className={btnGhost}>
                  View
                </a>
                <a href={downloadHref} className={btnGhost}>
                  Download
                </a>
                <button type="button" className={crmPrimaryCtaCls} disabled={pending} onClick={openPicker}>
                  {pending ? "Working…" : "Replace resume"}
                </button>
              </div>
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
          suggestions={parse.suggestions}
          current={candidate}
          onDismiss={dismissSuggestions}
          onReplaceResume={onReplaceResume}
        />
      ) : null}
    </div>
  );
}
