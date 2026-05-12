"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  PDF_SIGN_DOCUMENT_TYPE_SUGGESTIONS,
  type PdfSignDocumentType,
} from "@/lib/pdf-sign/constants";

export function TemplateUploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [docType, setDocType] = useState<PdfSignDocumentType>("generic_contract");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const file = formData.get("file") as File | null;
      const name = (formData.get("name") || "").toString().trim();
      if (!file || file.size === 0) {
        setErr("Choose a PDF file.");
        return;
      }
      if (!name) {
        setErr("Template name is required.");
        return;
      }
      formData.set("documentType", docType);
      // Always start with no fields. Admin will add them in the editor.
      formData.set("fieldsJson", "[]");
      const res = await fetch("/api/pdf-sign/admin/upload-template", {
        method: "POST",
        body: formData,
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        templateId?: string;
        error?: string;
      };
      if (!res.ok || !j.templateId) {
        setErr(j.error || "Upload failed.");
        return;
      }
      router.push(`/admin/signatures/templates/${encodeURIComponent(j.templateId)}?fresh=1`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          PDF file
        </label>
        <input
          name="file"
          type="file"
          accept="application/pdf"
          className="mt-1 block w-full text-sm"
          required
        />
        <p className="mt-1 text-xs text-slate-500">Only PDFs are supported.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Template name
          </label>
          <input
            name="name"
            placeholder="Example: Territory Manager Contract"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Name this PDF template so you can reuse it later.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Document type
          </label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as PdfSignDocumentType)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {PDF_SIGN_DOCUMENT_TYPE_SUGGESTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Helps route the document in workflows. Contracts and agreements typically use Agreement /
            Contract.
          </p>
        </div>
      </div>

      {err ? <p className="text-sm text-rose-700">{err}</p> : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload and open editor"}
        </button>
      </div>
    </form>
  );
}
