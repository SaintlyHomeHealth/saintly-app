"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type DragEvent, FormEvent, useEffect, useId, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

import { crmActionBtnSky, crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { normalizeFaxNumberToE164 } from "@/lib/fax/phone-numbers";
import { supabase } from "@/lib/supabase/client";

const FAX_DOCUMENTS_BUCKET = "fax-documents";
const MAX_PDF_FILES = 24;

type Toast = { type: "ok" | "err"; message: string };

function todayPathDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeStorageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPdfFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf" || t === "application/x-pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

/** Single file passes through; multiple PDFs are merged in page order. */
async function preparePdfFileForUpload(files: File[]): Promise<File> {
  if (files.length === 0) {
    throw new Error("No PDF files selected.");
  }
  if (files.length === 1) {
    return files[0];
  }
  const merged = await PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const saved = await merged.save();
  return new File([new Uint8Array(saved)], "fax-documents.pdf", { type: "application/pdf" });
}

async function uploadFaxPdf(file: File): Promise<string> {
  const storagePath = `outbound/${todayPathDate()}/${safeStorageId()}.pdf`;
  const { error: uploadError } = await supabase.storage.from(FAX_DOCUMENTS_BUCKET).upload(storagePath, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: signedUrlError } = await supabase.storage.from(FAX_DOCUMENTS_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (signedUrlError) throw new Error(signedUrlError.message);

  return storagePath;
}

export function SendFaxButton() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadId = useId();

  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.type === "ok" ? 4500 : 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open) {
      setSelectedFiles([]);
      setError(null);
      setDragActive(false);
    }
  }, [open]);

  /** Reuse the same checks as legacy file input: PDF only. */
  function addFilesFromList(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const rejected = incoming.filter((f) => !isPdfFile(f));
    const accepted = incoming.filter((f) => isPdfFile(f));

    if (rejected.length > 0) {
      setError("Only PDF files are supported.");
    } else {
      setError(null);
    }

    if (accepted.length === 0) return;

    setSelectedFiles((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > MAX_PDF_FILES) {
        setError(`You can attach up to ${MAX_PDF_FILES} PDFs at once.`);
        return next.slice(0, MAX_PDF_FILES);
      }
      return next;
    });
  }

  function removeFileAt(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (list?.length) addFilesFromList(list);
    event.target.value = "";
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function onDragEnter(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) {
      setDragActive(false);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const { files } = event.dataTransfer;
    if (files?.length) addFilesFromList(files);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    const formData = new FormData(event.currentTarget);
    const toNumber = normalizeFaxNumberToE164(String(formData.get("to") ?? ""));
    const mediaUrl = String(formData.get("media_url") ?? "").trim();

    setError(null);
    if (!toNumber) {
      setError("Enter a valid destination fax number.");
      return;
    }
    if (selectedFiles.length === 0 && !mediaUrl) {
      setError("Upload a PDF or paste a media URL.");
      return;
    }

    setSending(true);
    try {
      let storagePath: string | null = null;
      if (selectedFiles.length > 0) {
        const prepared = await preparePdfFileForUpload(selectedFiles);
        storagePath = await uploadFaxPdf(prepared);
      }

      const res = await fetch("/api/fax/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storagePath ? { to: toNumber, storage_path: storagePath } : { to: toNumber, media_url: mediaUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Fax send failed (${res.status}).`);
      }

      formRef.current?.reset();
      setSelectedFiles([]);
      setOpen(false);
      setToast({ type: "ok", message: "Fax sent" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fax send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <button type="button" className={crmPrimaryCtaCls} onClick={() => setOpen(true)}>
        Send Fax
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-lg rounded-[24px] border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-bold text-slate-900">Send Fax</p>
                <p className="mt-1 text-sm text-slate-500">Upload PDFs or paste a public media URL.</p>
              </div>
              <button
                type="button"
                className="rounded-full px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  if (!sending) {
                    setOpen(false);
                    setError(null);
                  }
                }}
                disabled={sending}
              >
                Close
              </button>
            </div>

            <form ref={formRef} className="mt-5 space-y-4" onSubmit={handleSubmit}>
              {error ? (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {error}
                </div>
              ) : null}

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                To <span className="text-rose-600">*</span>
                <input
                  name="to"
                  type="tel"
                  required
                  disabled={sending}
                  placeholder="(480) 555-1212"
                  className={crmFilterInputCls}
                />
              </label>

              <div className="flex flex-col gap-2">
                <span id={`${uploadId}-label`} className="text-[11px] font-semibold text-slate-700">
                  Fax documents
                </span>
                <input
                  ref={fileInputRef}
                  id={`${uploadId}-file`}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  disabled={sending}
                  className="sr-only"
                  onChange={onFileInputChange}
                  aria-labelledby={`${uploadId}-label`}
                />
                <label
                  htmlFor={`${uploadId}-file`}
                  onDragOver={onDragOver}
                  onDragEnter={onDragEnter}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                    dragActive
                      ? "border-sky-400 bg-sky-50 text-sky-950"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80"
                  } ${sending ? "pointer-events-none opacity-60" : ""}`}
                >
                  <span className="text-sm font-semibold text-slate-900">Drag and drop fax documents here</span>
                  <span className="mt-1 text-sm text-slate-600">or click to upload</span>
                  <span className="mt-2 text-xs font-medium text-slate-500">PDF only</span>
                </label>
                {selectedFiles.length > 0 ? (
                  <ul className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    {selectedFiles.map((file, index) => (
                      <li key={`${file.name}-${file.size}-${index}`} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-all text-slate-800" title={file.name}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={(e) => {
                            e.preventDefault();
                            removeFileAt(index);
                          }}
                          disabled={sending}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">or</div>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                Paste media URL
                <input
                  name="media_url"
                  type="url"
                  disabled={sending}
                  placeholder="https://..."
                  className={crmFilterInputCls}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className={crmActionBtnSky}
                  onClick={() => {
                    if (!sending) {
                      setOpen(false);
                      setError(null);
                    }
                  }}
                  disabled={sending}
                >
                  Cancel
                </button>
                <button type="submit" className={crmPrimaryCtaCls} disabled={sending}>
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
