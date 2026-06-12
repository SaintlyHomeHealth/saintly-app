"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

import { faxUi } from "@/app/admin/fax/_components/fax-center-ui";
import type { FaxDocumentTemplateRow } from "@/lib/fax/fax-document-template-types";
import {
  FAX_DOCUMENT_TEMPLATE_CONTENT_ERROR,
  FAX_DOCUMENT_TEMPLATE_NAME_ERROR,
  validateDocumentTemplateAttachmentFile,
  validateDocumentTemplateContent,
} from "@/lib/fax/fax-document-template-validation";

type Props = {
  mode: "create" | "edit";
  initial?: FaxDocumentTemplateRow;
};

export function DocumentTemplateForm({ mode, initial }: Props) {
  const router = useRouter();
  const fileInputId = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [bodyText, setBodyText] = useState(initial?.body_content ?? "");
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExistingAttachment =
    Boolean(initial?.attachment_storage_path) && !removeAttachment;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(FAX_DOCUMENT_TEMPLATE_NAME_ERROR);
      return;
    }

    const form = e.currentTarget;
    const formData = new FormData(form);
    const attachment = formData.get("attachment");
    const file = attachment instanceof File && attachment.size > 0 ? attachment : null;

    const attachmentValidationError = file ? validateDocumentTemplateAttachmentFile(file) : null;
    if (attachmentValidationError) {
      setError(attachmentValidationError);
      return;
    }

    const contentError = validateDocumentTemplateContent({
      bodyText,
      file,
      existingAttachmentPath: hasExistingAttachment ? initial?.attachment_storage_path : null,
    });
    if (contentError) {
      setError(contentError);
      return;
    }

    setBusy(true);
    try {
      const payload = new FormData();
      payload.set("name", trimmedName);
      payload.set("bodyText", bodyText);
      if (file) {
        payload.set("attachment", file);
      }
      if (mode === "edit" && removeAttachment) {
        payload.set("removeAttachment", "1");
      }

      const url =
        mode === "create"
          ? "/api/fax/document-templates"
          : `/api/fax/document-templates/${encodeURIComponent(initial!.id)}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        body: payload,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        templateId?: string;
        template?: { id?: string };
      };

      if (!res.ok) {
        setError(data.error || FAX_DOCUMENT_TEMPLATE_CONTENT_ERROR);
        return;
      }

      const templateId = data.templateId || data.template?.id || initial?.id;
      if (templateId) {
        router.push(`/admin/fax/document-templates/${encodeURIComponent(templateId)}`);
        router.refresh();
        return;
      }

      router.push("/admin/fax/document-templates");
      router.refresh();
    } catch {
      setError("Save failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <label className="flex flex-col gap-1.5">
        <span className={faxUi.label}>
          Template name <span className={faxUi.required}>*</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          className={faxUi.input}
          placeholder="Example: Face-to-face encounter"
          required
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={faxUi.label}>Template text</span>
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          disabled={busy}
          rows={16}
          className={faxUi.textarea}
          placeholder="Paste document text here to save as a reusable template."
          spellCheck={false}
        />
        <p className={faxUi.sectionHint}>
          Paste the full document body. Line breaks are preserved when you reopen this template.
        </p>
      </label>

      <div className="space-y-2">
        <span className={faxUi.label}>Attachment (optional)</span>
        {hasExistingAttachment ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <p className="font-medium">{initial?.attachment_file_name || "Attached file"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={`/api/fax/document-templates/${encodeURIComponent(initial!.id)}/attachment`}
                target="_blank"
                rel="noopener noreferrer"
                className={faxUi.btnGhost}
              >
                View attachment
              </a>
              <button
                type="button"
                className={faxUi.btnGhost}
                disabled={busy}
                onClick={() => setRemoveAttachment(true)}
              >
                Remove attachment
              </button>
            </div>
          </div>
        ) : null}

        <input
          id={fileInputId}
          name="attachment"
          type="file"
          accept="application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png"
          disabled={busy}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-900"
        />
        <p className={faxUi.sectionHint}>
          {bodyText.trim()
            ? "Upload a reference file if helpful. Not required when template text is provided."
            : "Upload a PDF or image, or paste template text above."}
        </p>
      </div>

      {error ? <div className={faxUi.alertError}>{error}</div> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/admin/fax/document-templates" className={faxUi.btnGhost}>
          Cancel
        </Link>
        <button type="submit" className={faxUi.btnPrimary} disabled={busy}>
          {busy ? "Saving…" : mode === "create" ? "Create template" : "Save template"}
        </button>
      </div>
    </form>
  );
}
