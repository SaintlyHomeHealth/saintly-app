"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { crmActionBtnSky, crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { normalizeFaxNumberToE164 } from "@/lib/fax/phone-numbers";
import { supabase } from "@/lib/supabase/client";

const FAX_DOCUMENTS_BUCKET = "fax-documents";

type Toast = { type: "ok" | "err"; message: string };

function todayPathDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeStorageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function uploadFaxPdf(file: File): Promise<string> {
  const storagePath = `outbound/${todayPathDate()}/${safeStorageId()}.pdf`;
  const { error: uploadError } = await supabase.storage.from(FAX_DOCUMENTS_BUCKET).upload(storagePath, file, {
    contentType: file.type || "application/pdf",
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
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.type === "ok" ? 4500 : 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;

    const formData = new FormData(event.currentTarget);
    const toNumber = normalizeFaxNumberToE164(String(formData.get("to") ?? ""));
    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    const mediaUrl = String(formData.get("media_url") ?? "").trim();

    setError(null);
    if (!toNumber) {
      setError("Enter a valid destination fax number.");
      return;
    }
    if (!file && !mediaUrl) {
      setError("Upload a PDF or paste a media URL.");
      return;
    }
    if (file && file.type && file.type !== "application/pdf") {
      setError("Upload a PDF file.");
      return;
    }

    setSending(true);
    try {
      const storagePath = file ? await uploadFaxPdf(file) : null;
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
                <p className="mt-1 text-sm text-slate-500">Upload a PDF or paste a public media URL.</p>
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

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                Upload PDF
                <input
                  name="file"
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={sending}
                  className="text-sm text-slate-800 file:mr-3 file:rounded-lg file:border file:border-sky-200 file:bg-sky-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-sky-900 disabled:opacity-50"
                />
              </label>

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
