"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FileText, Sparkles } from "lucide-react";

import {
  aiStatusLabel,
  formatDetectedType,
  LeadDocumentSuggestionsModal,
  type LeadDocumentSuggestionsLeadContext,
} from "@/app/admin/crm/leads/_components/LeadDocumentSuggestionsModal";
import {
  LEAD_REFERRAL_DOCUMENT_MAX_BYTES,
  LEAD_REFERRAL_DOCUMENT_TYPE_LABELS,
  LEAD_REFERRAL_DOCUMENT_TYPES,
} from "@/lib/crm/lead-referral-documents-constants";
import type { LeadDocumentIntakeSummary } from "@/lib/crm/lead-referral-document-ai-types";
import type { LeadReferralDocumentWorkspaceRow } from "@/lib/crm/lead-referral-documents-types";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

const inp =
  "mt-0.5 w-full max-w-md rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const maxMb = Math.round(LEAD_REFERRAL_DOCUMENT_MAX_BYTES / (1024 * 1024));

const reviewStatusLabel = {
  needs_review: "Needs review",
  reviewed: "Reviewed",
  rejected: "Rejected",
} as const;

function canPreview(mime: string | null): boolean {
  if (!mime) return false;
  return mime.startsWith("image/") || mime === "application/pdf";
}

export function LeadReferralDocumentsPanel(props: {
  leadId: string;
  initialRows: LeadReferralDocumentWorkspaceRow[];
  leadContext: LeadDocumentSuggestionsLeadContext;
}) {
  const { leadId, initialRows, leadContext } = props;
  const router = useRouter();

  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const [uploading, setUploading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string>(LEAD_REFERRAL_DOCUMENT_TYPES[0] ?? "other");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [aiSummary, setAiSummary] = useState<LeadDocumentIntakeSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [aiDismissed, setAiDismissed] = useState(false);

  const loadAiSummary = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/documents/analyze-all`);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; summary?: LeadDocumentIntakeSummary };
      if (data.ok && data.summary) setAiSummary(data.summary);
    } finally {
      setAiLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (initialRows.length > 0) void loadAiSummary();
  }, [initialRows.length, loadAiSummary]);

  const refresh = useCallback(() => {
    router.refresh();
    void loadAiSummary();
  }, [router, loadAiSummary]);

  const fileHref = (id: string, download?: boolean) =>
    `/api/leads/${encodeURIComponent(leadId)}/documents/${encodeURIComponent(id)}/file${download ? "?download=1" : ""}`;

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file || file.size <= 0) {
      setError("Choose a file to upload.");
      return;
    }
    if (file.size > LEAD_REFERRAL_DOCUMENT_MAX_BYTES) {
      setError(`File is too large (max ${maxMb} MB).`);
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("document_type", documentType);
      if (notes.trim()) fd.set("notes", notes.trim());

      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/documents`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(
          data.error === "invalid_type"
            ? "This file type is not allowed. Use PDF, JPG, PNG, WEBP, or DOCX."
            : data.error === "file_too_large"
              ? `File is too large (max ${maxMb} MB).`
              : "Upload failed. Try again."
        );
        return;
      }

      setFile(null);
      setNotes("");
      refresh();
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  async function markReviewed(documentId: string) {
    setError(null);
    setActingId(documentId);
    try {
      const res = await fetch(
        `/api/leads/${encodeURIComponent(leadId)}/documents/${encodeURIComponent(documentId)}/mark-reviewed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review_notes: reviewNotes[documentId]?.trim() || null }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Could not update review status.");
        return;
      }
      refresh();
    } catch {
      setError("Could not update review status.");
    } finally {
      setActingId(null);
    }
  }

  async function rejectDocument(documentId: string) {
    if (!window.confirm("Reject this document? Intake can request a replacement from the referral source.")) return;
    setError(null);
    setActingId(documentId);
    try {
      const res = await fetch(
        `/api/leads/${encodeURIComponent(leadId)}/documents/${encodeURIComponent(documentId)}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review_notes: reviewNotes[documentId]?.trim() || null }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Could not reject document.");
        return;
      }
      refresh();
    } catch {
      setError("Could not reject document.");
    } finally {
      setActingId(null);
    }
  }

  async function analyzeDocument(documentId: string) {
    setError(null);
    setAnalyzingId(documentId);
    try {
      const res = await fetch(
        `/api/leads/${encodeURIComponent(leadId)}/documents/${encodeURIComponent(documentId)}/analyze`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "AI review failed. Try again or review manually.");
        return;
      }
      refresh();
    } catch {
      setError("AI review failed. Try again.");
    } finally {
      setAnalyzingId(null);
    }
  }

  async function analyzeAllDocuments() {
    setError(null);
    setAiLoading(true);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/documents/analyze-all`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        summary?: LeadDocumentIntakeSummary;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "AI document review is not configured or failed.");
        return;
      }
      if (data.summary) setAiSummary(data.summary);
      refresh();
    } catch {
      setError("Could not analyze documents.");
    } finally {
      setAiLoading(false);
    }
  }

  const summary = aiSummary;
  const aiConfigured = summary?.configured ?? true;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
          {error}
        </div>
      ) : null}

      {rows.length > 0 && !aiDismissed ? (
        <section className="rounded-xl border border-violet-200/80 bg-violet-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-700" aria-hidden />
              <h3 className="text-sm font-semibold text-violet-950">AI intake summary</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={aiLoading || !aiConfigured}
                onClick={() => void analyzeAllDocuments()}
                className="rounded-lg border border-violet-400 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
              >
                {aiLoading ? "Analyzing…" : "Analyze all documents"}
              </button>
              {summary && summary.ai_ready_count > 0 ? (
                <button
                  type="button"
                  onClick={() => setSuggestionsOpen(true)}
                  className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                >
                  Apply selected suggestions
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setAiDismissed(true)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Dismiss
              </button>
            </div>
          </div>

          {!aiConfigured ? (
            <p className="mt-3 text-sm text-slate-600">AI document review is not configured.</p>
          ) : summary ? (
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {summary.combined_summary ? <p>{summary.combined_summary}</p> : null}
              <p className="text-xs text-slate-600">
                AI status: {summary.ai_ready_count} ready · {summary.ai_pending_count} pending ·{" "}
                {summary.ai_failed_count} failed
                {summary.average_confidence != null
                  ? ` · avg confidence ${Math.round(summary.average_confidence * 100)}%`
                  : ""}
              </p>
              {summary.missing_items.length > 0 ? (
                <p className="text-xs font-medium text-amber-900">
                  Missing: {summary.missing_items.join(", ")}
                </p>
              ) : null}
              {summary.suggested_checklist_updates.length > 0 ? (
                <ul className="text-xs text-emerald-900">
                  {summary.suggested_checklist_updates.map((s) => (
                    <li key={s.key}>
                      {s.label} — {s.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : aiLoading ? (
            <p className="mt-3 text-sm text-slate-600">Loading AI summary…</p>
          ) : null}
        </section>
      ) : null}

      <form onSubmit={onUpload} className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Upload document</p>
        <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            File
            <input
              type="file"
              className={inp}
              disabled={uploading}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
            />
            <span className="text-[10px] font-normal text-slate-400">
              PDF, JPG, PNG, WEBP, or DOCX — up to {maxMb} MB.
            </span>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Document type
            <select
              className={inp}
              value={documentType}
              disabled={uploading}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              {LEAD_REFERRAL_DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEAD_REFERRAL_DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Notes (optional)
            <textarea
              className={inp}
              rows={2}
              value={notes}
              disabled={uploading}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context for intake review…"
            />
          </label>
        </div>
        <div className="mt-4">
          <button
            type="submit"
            disabled={uploading || !file}
            className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload document"}
          </button>
        </div>
      </form>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {rows.length} document{rows.length === 1 ? "" : "s"}
        </p>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No referral documents yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words font-medium text-slate-900">{r.original_file_name}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {r.document_type ? LEAD_REFERRAL_DOCUMENT_TYPE_LABELS[r.document_type] : "Unspecified type"}
                        {" · "}
                        AI: {aiStatusLabel(r)}
                        {r.ai_confidence != null ? ` (${Math.round(r.ai_confidence * 100)}%)` : ""}
                      </p>
                      {r.extracted_summary ? (
                        <p className="mt-2 rounded-lg bg-violet-50 px-2.5 py-2 text-xs text-violet-950">
                          AI summary (needs verification): {r.extracted_summary}
                        </p>
                      ) : null}
                      {r.ai_processing_error ? (
                        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-900">
                          AI error: {r.ai_processing_error}
                        </p>
                      ) : null}
                      {r.extracted_json && typeof r.extracted_json === "object" ? (
                        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-700">
                          {(() => {
                            const ej = r.extracted_json as Record<string, unknown>;
                            const dt = typeof ej.document_type === "string" ? ej.document_type : null;
                            return dt ? (
                              <p>
                                <span className="font-medium">Detected type:</span> {formatDetectedType(dt)}
                              </p>
                            ) : null;
                          })()}
                          {Array.isArray((r.extracted_json as { warnings?: string[] }).warnings) ? (
                            <ul className="mt-1 list-disc pl-4 text-amber-900">
                              {((r.extracted_json as { warnings: string[] }).warnings ?? []).slice(0, 3).map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                        <div>
                          <dt className="inline font-medium text-slate-600">Uploaded </dt>
                          <dd className="inline">
                            {formatAppDateTime(r.created_at, "", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-slate-600">By </dt>
                          <dd className="inline">{r.uploaded_by_label ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-slate-600">Size </dt>
                          <dd className="inline">{formatBytes(r.file_size_bytes)}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-slate-600">Review </dt>
                          <dd className="inline">{reviewStatusLabel[r.review_status]}</dd>
                        </div>
                      </dl>
                      {r.review_notes ? (
                        <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">{r.review_notes}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {canPreview(r.mime_type) ? (
                      <a
                        href={fileHref(r.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        View
                      </a>
                    ) : null}
                    <a
                      href={fileHref(r.id, true)}
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      disabled={analyzingId === r.id || !aiConfigured}
                      onClick={() => void analyzeDocument(r.id)}
                      className="inline-flex items-center rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                    >
                      {analyzingId === r.id
                        ? "Analyzing…"
                        : r.ai_processed_at
                          ? "Re-analyze"
                          : "Analyze with AI"}
                    </button>
                  </div>
                </div>

                {r.review_status === "needs_review" ? (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                      Review note (optional)
                      <textarea
                        className={inp}
                        rows={2}
                        value={reviewNotes[r.id] ?? ""}
                        disabled={actingId === r.id}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actingId === r.id}
                        onClick={() => void markReviewed(r.id)}
                        className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Mark reviewed
                      </button>
                      <button
                        type="button"
                        disabled={actingId === r.id}
                        onClick={() => void rejectDocument(r.id)}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {summary && suggestionsOpen ? (
        <LeadDocumentSuggestionsModal
          open={suggestionsOpen}
          onClose={() => setSuggestionsOpen(false)}
          leadId={leadId}
          summary={summary}
          leadContext={leadContext}
          onApplied={refresh}
        />
      ) : null}
    </div>
  );
}
