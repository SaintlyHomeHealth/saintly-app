"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

import {
  attachReferralToExistingPatient,
  createPatientFromReferral,
  savePatientReferralOnly,
} from "@/app/admin/crm/patient-referral-actions";
import {
  crmFilterInputCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import { PATIENT_REFERRAL_SOURCE_OPTIONS } from "@/lib/crm/patient-referral/options";
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

type QueuedReferralFile = {
  id: string;
  file: File;
  status: PatientReferralUploadStatus;
  error?: string;
  parse?: PatientReferralParsePayload | null;
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
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export function QuickDropReferralSection() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
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
  const [attachPatientId, setAttachPatientId] = useState<string | null>(null);
  const [forceDuplicate, setForceDuplicate] = useState(false);

  const activeItem = queue.find((q) => q.id === activeFileId) ?? null;

  const processFile = useCallback(
    async (item: QueuedReferralFile) => {
      if (!referralSourceType) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "failed", error: "Select a referral source first." } : q
          )
        );
        return;
      }

      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "uploading", error: undefined } : q))
      );

      const fd = new FormData();
      fd.set("file", item.file);
      fd.set("referral_source_type", referralSourceType);

      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "reading" } : q)));

      try {
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: "extracting" } : q)));
        const res = await fetch("/api/crm/patient-referrals/parse-only", { method: "POST", body: fd });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          parse?: PatientReferralParsePayload;
        };

        if (res.status === 403) {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "failed", error: "You do not have access." } : q))
          );
          return;
        }
        if (res.status === 400) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, status: "failed", error: json.error ?? "Invalid file." } : q
            )
          );
          return;
        }

        const parse = json.parse ?? null;
        const status: PatientReferralUploadStatus =
          parse?.needsReview || !parse?.ok ? "needs_review" : "ready";

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status,
                  parse,
                }
              : q
          )
        );
      } catch {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "failed", error: "Network error — try again." } : q))
        );
      }
    },
    [referralSourceType]
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      if (!referralSourceType) {
        setToast("Select a referral source before uploading.");
        return;
      }
      const arr = Array.from(list);
      const next: QueuedReferralFile[] = [];
      for (const f of arr) {
        const lower = f.name.toLowerCase();
        const ok =
          lower.endsWith(".pdf") ||
          lower.endsWith(".png") ||
          lower.endsWith(".jpg") ||
          lower.endsWith(".jpeg") ||
          lower.endsWith(".heic") ||
          lower.endsWith(".heif");
        if (!ok) continue;
        next.push({ id: crypto.randomUUID(), file: f, status: "uploading" });
      }
      if (!next.length) {
        setToast("No supported files (PDF, PNG, JPG, HEIC).");
        return;
      }
      setToast(null);
      setExpanded(true);
      setQueue((q) => [...q, ...next]);
      for (const item of next) void processFile(item);
    },
    [processFile, referralSourceType]
  );

  function openReview(item: QueuedReferralFile) {
    setActiveFileId(item.id);
    const form = item.parse?.suggestions
      ? parsedSuggestionsToReviewForm(item.parse.suggestions, referralSourceType)
      : { ...EMPTY_PATIENT_REFERRAL_REVIEW_FORM, referral_source_type: referralSourceType };
    setReviewForm(form);
    setReviewOpen(true);
    setDupes(null);
    setAttachPatientId(null);
    setForceDuplicate(false);
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
          setQueue((q) => q.filter((x) => x.id !== activeItem.id));
          router.refresh();
        }
        return;
      }

      if (res.reason === "duplicates" && "duplicates" in res && res.duplicates) {
        setDupes(res.duplicates);
        setQueue((prev) =>
          prev.map((q) => (q.id === activeItem.id ? { ...q, status: "duplicate" } : q))
        );
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
        <button
          type="button"
          className={crmPrimaryCtaCls}
          onClick={() => setExpanded((v) => !v)}
        >
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
              disabled={!referralSourceType || pending}
              onClick={() => inputRef.current?.click()}
            >
              Upload Referral
            </button>
          </div>

          {toast ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{toast}</div>
          ) : null}

          {queue.length > 0 ? (
            <ul className="space-y-2">
              {queue.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{item.file.name}</p>
                    {item.error ? <p className="text-xs text-rose-700">{item.error}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPillClass(item.status)}`}>
                      {uploadStatusLabel(item.status)}
                    </span>
                    {(item.status === "ready" || item.status === "needs_review" || item.status === "duplicate") && (
                      <button
                        type="button"
                        className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                        onClick={() => openReview(item)}
                      >
                        Review & Create Patient
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-500 hover:text-slate-800"
                      onClick={() => setQueue((q) => q.filter((x) => x.id !== item.id))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
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
        pending={pending}
        onClose={() => setReviewOpen(false)}
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
