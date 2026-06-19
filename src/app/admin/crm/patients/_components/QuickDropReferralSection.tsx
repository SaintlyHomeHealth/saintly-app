"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  attachReferralToExistingPatient,
  createPatientFromReferral,
  findPatientReferralDuplicatesAction,
  getPatientReferralFileSignedUrl,
  savePatientReferralOnly,
} from "@/app/admin/crm/patient-referral-actions";
import {
  crmFilterInputCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import { PATIENT_REFERRAL_SOURCE_OPTIONS, type PatientReferralSourceType } from "@/lib/crm/patient-referral/options";
import { hasMeaningfulParseData, deriveQueueStatusAfterParse, summarizeParsedReferral } from "@/lib/crm/patient-referral/queue-summary";
import {
  EMPTY_PATIENT_REFERRAL_REVIEW_FORM,
  parsedSuggestionsToReviewForm,
  reviewFormToFormData,
  type PatientReferralReviewFormState,
} from "@/lib/crm/patient-referral/suggestions-to-form";
import type { PatientReferralDuplicateRow } from "@/lib/crm/patient-referral/duplicates";
import type { PatientReferralParsePayload, PatientReferralUploadStatus } from "@/lib/crm/patient-referral/types";
import { uploadStatusLabel } from "@/lib/crm/patient-referral/types";
import { PATIENT_REFERRAL_ACCEPT_ATTR } from "@/lib/crm/patient-referral/upload-mime";

import { PatientReferralDuplicateModal } from "./PatientReferralDuplicateModal";
import { PatientReferralReviewDrawer } from "./PatientReferralReviewDrawer";

/**
 * Raw extracted referral text + parsed PHI are only logged / shown in the UI
 * when this temporary admin debug flag is explicitly enabled. Off in normal
 * production so patient text never lands in the browser console.
 */
const PATIENT_REFERRAL_DEBUG = process.env.NEXT_PUBLIC_PATIENT_REFERRAL_DEBUG === "true";

type QueuedReferralFile = {
  id: string;
  file: File;
  objectUrl: string;
  status: PatientReferralUploadStatus;
  parseAttempted: boolean;
  error?: string;
  parse?: PatientReferralParsePayload | null;
  storagePath?: string | null;
};

function statusPillClass(status: PatientReferralUploadStatus): string {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200";
    case "duplicate":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "failed":
      return "bg-rose-100 text-rose-900 ring-rose-200";
    case "needs_review":
      return "bg-sky-100 text-sky-900 ring-sky-200";
    case "uploading":
    case "reading":
    case "extracting":
      return "bg-indigo-100 text-indigo-900 ring-indigo-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function isProcessingStatus(status: PatientReferralUploadStatus): boolean {
  return status === "uploading" || status === "reading" || status === "extracting";
}

function openInNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function QuickDropReferralSection() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [referralSourceType, setReferralSourceType] = useState("");
  const [queue, setQueue] = useState<QueuedReferralFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState<PatientReferralReviewFormState>(EMPTY_PATIENT_REFERRAL_REVIEW_FORM);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dupes, setDupes] = useState<PatientReferralDuplicateRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [parsePending, setParsePending] = useState(false);
  const [attachPatientId, setAttachPatientId] = useState<string | null>(null);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    id: string;
    loading: boolean;
    extractedTextLength?: number;
    preview?: string;
    parserResult?: unknown;
    parserErrors?: string[];
    error?: string;
  } | null>(null);

  const activeItem = queue.find((q) => q.id === activeFileId) ?? null;

  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      objectUrlsRef.current.clear();
    };
  }, []);

  const updateQueueItem = useCallback((id: string, patch: Partial<QueuedReferralFile>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const runParse = useCallback(
    async (id: string, file: File, sourceType: string): Promise<Partial<QueuedReferralFile> | null> => {
      if (!sourceType) {
        updateQueueItem(id, {
          status: "failed",
          parseAttempted: true,
          error: "Select a referral source first.",
        });
        return null;
      }

      updateQueueItem(id, { status: "uploading", error: undefined, parseAttempted: false });
      await new Promise((r) => setTimeout(r, 0));
      updateQueueItem(id, { status: "reading" });
      await new Promise((r) => setTimeout(r, 0));
      updateQueueItem(id, { status: "extracting" });

      const fd = new FormData();
      fd.set("file", file);
      fd.set("referral_source_type", sourceType);
      fd.set("client_file_size", String(file.size));
      fd.set("client_file_type", file.type || "");

      try {
        const res = await fetch("/api/crm/patient-referrals/parse-only", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as
          | {
              ok: true;
              parse: PatientReferralParsePayload;
              debug?: Record<string, unknown> & {
                textPreview?: string;
                parseDebug?: PatientReferralParsePayload["parseDebug"];
              };
            }
          | { error?: string }
          | null;

        // Always log CONCISE, non-PHI diagnostics so the real failure point is
        // visible in the browser console (no raw patient text / parsed PHI).
        const concise =
          json && "debug" in json && json.debug ? (json.debug as Record<string, unknown>) : {};
        console.info("[patient-referral] parse-only", {
          status: res.status,
          clientFileSize: file.size,
          clientFileType: file.type,
          serverFileSize: concise.serverFileSize ?? null,
          bufferLength: concise.bufferLength ?? null,
          startsWithPdf: concise.startsWithPdf ?? null,
          extractedTextLength: concise.extractedTextLength ?? null,
          pdfExtractMethod: concise.pdfExtractMethod ?? null,
          pdfParseError: concise.pdfParseError ?? null,
          pdfjsError: concise.pdfjsError ?? null,
        });

        // Full payload (raw text preview + parsed PHI) only when the debug flag is on.
        if (PATIENT_REFERRAL_DEBUG) {
          console.info("[patient-referral] parse-only FULL (debug)", { status: res.status, body: json });
        }

        if (!res.ok || !json || !("ok" in json) || !json.ok) {
          const errMsg =
            json && "error" in json && json.error
              ? json.error
              : `Parse request failed (${res.status})`;
          const patch: Partial<QueuedReferralFile> = {
            status: "failed",
            parseAttempted: true,
            error: errMsg,
            parse: {
              ok: false,
              quality: "manual",
              suggestions: null,
              messages: [errMsg],
            },
          };
          updateQueueItem(id, patch);
          return patch;
        }

        const status = deriveQueueStatusAfterParse({
          parseAttempted: true,
          parse: json.parse,
        });

        let failureError: string | undefined;
        if (status === "failed") {
          const base =
            json.parse.messages.join(" ") || json.parse.statusHeadline || "Failed to parse document.";
          const d = json.debug ?? {};
          const diag = [
            `received ${d.serverFileSize ?? d.bufferLength ?? "?"} bytes`,
            `%PDF=${d.startsWithPdf ?? "?"}`,
            `text=${d.extractedTextLength ?? 0}`,
            d.pdfExtractMethod ? `via ${d.pdfExtractMethod}` : null,
            d.pdfParseError ? `pdf-parse err: ${String(d.pdfParseError).split("\n")[0]}` : null,
            d.pdfjsError ? `pdfjs err: ${String(d.pdfjsError).split("\n")[0]}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          failureError = diag ? `${base} (${diag})` : base;
        }

        const patch: Partial<QueuedReferralFile> = {
          status,
          parseAttempted: true,
          parse: json.parse,
          error: failureError,
        };

        updateQueueItem(id, patch);
        return patch;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network error — try again.";
        const patch: Partial<QueuedReferralFile> = {
          status: "failed",
          parseAttempted: true,
          error: msg,
        };
        updateQueueItem(id, patch);
        return patch;
      }
    },
    [updateQueueItem]
  );

  const enqueueAndParse = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(objectUrl);

      setQueue((prev) => [
        ...prev,
        {
          id,
          file,
          objectUrl,
          status: "uploading",
          parseAttempted: false,
          parse: null,
        },
      ]);

      await runParse(id, file, referralSourceType);
    },
    [referralSourceType, runParse]
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      if (!referralSourceType) {
        setToast("Select a referral source before uploading.");
        return;
      }
      const arr = Array.from(list);
      const accepted: File[] = [];
      for (const f of arr) {
        const lower = f.name.toLowerCase();
        const ok =
          lower.endsWith(".pdf") ||
          lower.endsWith(".png") ||
          lower.endsWith(".jpg") ||
          lower.endsWith(".jpeg") ||
          lower.endsWith(".heic") ||
          lower.endsWith(".heif");
        if (ok) accepted.push(f);
      }
      if (!accepted.length) {
        setToast("No supported files (PDF, PNG, JPG, HEIC).");
        return;
      }
      setToast(null);
      setExpanded(true);
      for (const f of accepted) void enqueueAndParse(f);
    },
    [enqueueAndParse, referralSourceType]
  );

  const removeItem = useCallback((id: string, objectUrl: string) => {
    URL.revokeObjectURL(objectUrl);
    objectUrlsRef.current.delete(objectUrl);
    setQueue((q) => q.filter((x) => x.id !== id));
    if (activeFileId === id) {
      setReviewOpen(false);
      setActiveFileId(null);
    }
  }, [activeFileId]);

  const runDebugExtract = useCallback(
    async (item: QueuedReferralFile) => {
      setDebugInfo({ id: item.id, loading: true });
      try {
        const fd = new FormData();
        fd.set("file", item.file);
        fd.set("client_file_size", String(item.file.size));
        fd.set("referral_source_type", referralSourceType || "");
        const res = await fetch("/api/crm/patient-referrals/debug-parse", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!res.ok || !json) {
          setDebugInfo({
            id: item.id,
            loading: false,
            error: (json && (json.error as string)) || `Debug request failed (${res.status})`,
          });
          return;
        }
        setDebugInfo({
          id: item.id,
          loading: false,
          extractedTextLength: (json.extractedTextLength as number) ?? 0,
          preview: (json.extractedTextPreview as string) ?? "",
          parserResult: json.parserResult ?? null,
          parserErrors: (json.parserErrors as string[]) ?? [],
        });
      } catch (e) {
        setDebugInfo({
          id: item.id,
          loading: false,
          error: e instanceof Error ? e.message : "Debug request error",
        });
      }
    },
    [referralSourceType]
  );

  const viewFile = useCallback(async (item: QueuedReferralFile) => {
    if (item.objectUrl) {
      openInNewTab(item.objectUrl);
      return;
    }
    if (item.storagePath) {
      const res = await getPatientReferralFileSignedUrl(item.storagePath);
      if (res.ok) openInNewTab(res.url);
      else setToast(res.error);
    }
  }, []);

  async function runDuplicateCheck(form: PatientReferralReviewFormState) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) {
      fd.set(k, v ?? "");
    }
    const dupRes = await findPatientReferralDuplicatesAction(fd);
    if (dupRes.ok && dupRes.duplicates.length > 0) {
      setDupes(dupRes.duplicates);
      if (activeFileId) {
        updateQueueItem(activeFileId, { status: "duplicate" });
      }
    }
  }

  function openReviewFromItem(item: QueuedReferralFile) {
    setActiveFileId(item.id);
    const form = item.parse?.suggestions
      ? parsedSuggestionsToReviewForm(item.parse.suggestions, referralSourceType)
      : { ...EMPTY_PATIENT_REFERRAL_REVIEW_FORM, referral_source_type: referralSourceType };
    setReviewForm(form);
    setReviewOpen(true);
    setAttachPatientId(null);
    setForceDuplicate(false);
    void runDuplicateCheck(form);
  }

  async function handleReview(item: QueuedReferralFile, manualOnly = false) {
    if (!referralSourceType) {
      setToast("Select a referral source first.");
      return;
    }

    setToast(null);
    setDupes(null);

    let current = item;

    if (!manualOnly && (!item.parseAttempted || isProcessingStatus(item.status))) {
      setParsePending(true);
      setActiveFileId(item.id);
      const patch = await runParse(item.id, item.file, referralSourceType);
      setParsePending(false);
      if (patch) {
        current = { ...item, ...patch };
      }
    }

    if (!manualOnly && !hasMeaningfulParseData(current.parse?.suggestions ?? null)) {
      setToast(
        current.error ??
          current.parse?.statusHeadline ??
          current.parse?.messages?.[0] ??
          "Could not extract patient fields from this document."
      );
      return;
    }

    if (current.status === "failed" && !manualOnly) {
      setToast(current.error ?? "Failed to parse document. Use Enter Manually if needed.");
      return;
    }

    if (current.status === "failed" || manualOnly) {
      current = {
        ...current,
        parse:
          current.parse ??
          ({
            ok: false,
            quality: "manual",
            suggestions: {
              referral_source_type: referralSourceType as PatientReferralReviewFormState["referral_source_type"],
              intake_status: "New Referral",
              patient_status: "pending",
            },
            messages: [current.error ?? "Enter referral details manually."],
          } as PatientReferralParsePayload),
      };
    }

    openReviewFromItem(current);
  }

  function onFormChange(name: keyof PatientReferralReviewFormState, value: string) {
    setReviewForm((prev) => ({ ...prev, [name]: value }));
  }

  function runSubmit(mode: "create" | "attach" | "referral_only", patientId?: string, force = false) {
    if (!activeItem) return;
    const fd = reviewFormToFormData(reviewForm, activeItem.file);
    if (patientId) fd.set("existing_patient_id", patientId);
    if (force) fd.set("force_duplicate", "1");

    startTransition(async () => {
      setToast(null);
      const action =
        mode === "attach"
          ? attachReferralToExistingPatient
          : mode === "referral_only"
            ? savePatientReferralOnly
            : createPatientFromReferral;

      const res = await action(fd);
      if (res.ok) {
        setReviewOpen(false);
        setDupes(null);
        if ("patientId" in res && res.patientId) {
          setToast(res.message);
          router.push(`/admin/crm/patients/${res.patientId}?referralCreated=1`);
        } else {
          setToast(res.message);
          removeItem(activeItem.id, activeItem.objectUrl);
          router.refresh();
        }
        return;
      }

      if (res.reason === "duplicates" && "duplicates" in res && res.duplicates) {
        setDupes(res.duplicates);
        updateQueueItem(activeItem.id, { status: "duplicate" });
        return;
      }

      const errMsg =
        res.reason === "validation_failed" && "errors" in res
          ? res.errors?.join(" ")
          : "Could not save referral. Check required fields and try again.";
      setToast(errMsg ?? "Something went wrong.");
    });
  }

  return (
    <div className="rounded-[24px] border border-sky-200/80 bg-gradient-to-br from-sky-50/80 via-white to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Quick Drop Referral</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Drop doctor orders, Tango/Dina authorizations, hospital referrals, or scanned intake documents. We OCR the
            file, prefill patient fields, and let you review before creating a chart.
          </p>
        </div>
        <button type="button" className={crmPrimaryCtaCls} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide" : "Quick Drop Referral"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-5 space-y-4">
          <label className="block max-w-md">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Referral source <span className="text-rose-600">*</span>
            </span>
            <select
              className={`${crmFilterInputCls} mt-1.5 w-full`}
              value={referralSourceType}
              onChange={(e) => setReferralSourceType(e.target.value)}
            >
              <option value="">Select where this referral came from…</option>
              {PATIENT_REFERRAL_SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div
            className={`rounded-[20px] border-2 border-dashed px-6 py-8 text-center transition ${
              dragOver ? "border-sky-500 bg-sky-50/80" : "border-slate-300 bg-white/70"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
          >
            <p className="text-sm font-medium text-slate-800">Drag & drop referral documents here</p>
            <p className="mt-1 text-xs text-slate-500">PDF, PNG, JPG/JPEG, HEIC · max 10 MB · each file processed separately</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={PATIENT_REFERRAL_ACCEPT_ATTR}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="mt-4 rounded-lg border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
              disabled={!referralSourceType || pending || parsePending}
              onClick={() => inputRef.current?.click()}
            >
              Upload Referral
            </button>
          </div>

          {toast ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{toast}</div>
          ) : null}

          {queue.length > 0 ? (
            <ul className="space-y-3">
              {queue.map((item) => {
                const summary = summarizeParsedReferral(item.parse?.suggestions);
                const parsed = item.parseAttempted && hasMeaningfulParseData(item.parse?.suggestions);
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{item.file.name}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPillClass(item.status)}`}
                          >
                            {isProcessingStatus(item.status) || (parsePending && item.id === activeFileId)
                              ? uploadStatusLabel(item.status)
                              : item.status === "failed"
                                ? "Failed to parse"
                                : item.status === "ready"
                                  ? "Ready for review"
                                  : uploadStatusLabel(item.status)}
                          </span>
                          {parsed ? (
                            <span className="text-[11px] text-slate-600">
                              {summary.patientName ? (
                                <>
                                  Patient: <span className="font-medium text-slate-800">{summary.patientName}</span>
                                </>
                              ) : null}
                              {summary.payer ? (
                                <>
                                  {summary.patientName ? " · " : ""}
                                  Payer: <span className="font-medium text-slate-800">{summary.payer}</span>
                                </>
                              ) : null}
                              {summary.socDate ? (
                                <>
                                  {(summary.patientName || summary.payer) ? " · " : ""}
                                  SOC: <span className="font-medium text-slate-800">{summary.socDate}</span>
                                </>
                              ) : null}
                              {summary.authNumber ? (
                                <>
                                  {(summary.patientName || summary.payer || summary.socDate) ? " · " : ""}
                                  Auth: <span className="font-medium text-slate-800">{summary.authNumber}</span>
                                </>
                              ) : null}
                              {summary.snVisits != null ? (
                                <>
                                  {(summary.patientName || summary.payer || summary.socDate || summary.authNumber)
                                    ? " · "
                                    : ""}
                                  SN: <span className="font-medium text-slate-800">{summary.snVisits}</span>
                                </>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                        {item.error ? <p className="mt-1 text-xs text-rose-700">{item.error}</p> : null}
                        {PATIENT_REFERRAL_DEBUG && debugInfo?.id === item.id && !debugInfo.loading ? (
                          <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/70 p-3 text-[11px] text-violet-950">
                            {debugInfo.error ? (
                              <p className="font-semibold text-rose-700">Debug error: {debugInfo.error}</p>
                            ) : (
                              <>
                                <p className="font-semibold">
                                  extractedTextLength: {debugInfo.extractedTextLength ?? 0}
                                </p>
                                {debugInfo.parserErrors && debugInfo.parserErrors.length > 0 ? (
                                  <p className="mt-1 text-rose-700">parserErrors: {debugInfo.parserErrors.join(" | ")}</p>
                                ) : (
                                  <p className="mt-1 text-emerald-700">parserErrors: none</p>
                                )}
                                <p className="mt-1 font-semibold">First 500 chars:</p>
                                <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-white/80 p-2">
                                  {debugInfo.preview || "(empty)"}
                                </pre>
                                <p className="mt-1 font-semibold">Parser result:</p>
                                <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-white/80 p-2">
                                  {JSON.stringify(debugInfo.parserResult, null, 2)}
                                </pre>
                                <button
                                  type="button"
                                  className="mt-2 text-[11px] font-medium text-violet-700 underline"
                                  onClick={() => setDebugInfo(null)}
                                >
                                  Hide debug
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => void viewFile(item)}
                        >
                          View file
                        </button>
                        {PATIENT_REFERRAL_DEBUG ? (
                          <button
                            type="button"
                            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                            disabled={debugInfo?.id === item.id && debugInfo.loading}
                            onClick={() => void runDebugExtract(item)}
                          >
                            {debugInfo?.id === item.id && debugInfo.loading ? "Debugging…" : "Debug extracted text"}
                          </button>
                        ) : null}
                        {item.status === "failed" ? (
                          <button
                            type="button"
                            className="rounded-lg border border-amber-600 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                            disabled={parsePending}
                            onClick={() => void handleReview(item, true)}
                          >
                            Enter Manually
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                            disabled={
                              parsePending || isProcessingStatus(item.status) || !hasMeaningfulParseData(item.parse?.suggestions)
                            }
                            onClick={() => void handleReview(item)}
                          >
                            {parsePending && activeFileId === item.id
                              ? "Processing…"
                              : "Review & Create Patient"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-500 hover:text-slate-800"
                          onClick={() => removeItem(item.id, item.objectUrl)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <PatientReferralReviewDrawer
        open={reviewOpen}
        fileName={activeItem?.file.name ?? ""}
        parse={activeItem?.parse ?? null}
        form={reviewForm}
        onChange={onFormChange}
        pending={pending || parsePending}
        onClose={() => setReviewOpen(false)}
        onViewFile={activeItem ? () => void viewFile(activeItem) : undefined}
        onCreatePatient={() => {
          if (attachPatientId) runSubmit("attach", attachPatientId, forceDuplicate);
          else runSubmit("create", undefined, forceDuplicate);
        }}
        onSaveReferralOnly={() => runSubmit("referral_only")}
        attachPatientId={attachPatientId}
      />

      <PatientReferralDuplicateModal
        open={Boolean(dupes?.length)}
        duplicates={dupes ?? []}
        pending={pending}
        onOpenPatient={(id) => router.push(`/admin/crm/patients/${id}`)}
        onUpdateExisting={(id) => {
          setAttachPatientId(id);
          setDupes(null);
        }}
        onCreateAnyway={() => {
          setForceDuplicate(true);
          runSubmit(attachPatientId ? "attach" : "create", attachPatientId ?? undefined, true);
        }}
        onCancel={() => setDupes(null)}
      />
    </div>
  );
}
