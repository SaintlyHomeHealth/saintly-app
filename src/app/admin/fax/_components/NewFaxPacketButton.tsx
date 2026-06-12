"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useId, useRef, useState } from "react";

import {
  FaxField,
  FaxPacketStepIndicator,
  FaxSection,
  FaxToast,
  SaintlyLogoMark,
  faxUi,
  type FaxPacketStepId,
} from "@/app/admin/fax/_components/fax-center-ui";
import { SAINTLY_RETURN_FAX_DISPLAY } from "@/lib/fax/cover-sheet-constants";
import type { FaxCoverSheetFields, FaxCoverSheetTemplateRow, FaxPacketMetadata } from "@/lib/fax/fax-cover-template-types";
import type { FaxDocumentTemplateRow } from "@/lib/fax/fax-document-template-types";
import { formatDateOfBirthInput } from "@/lib/fax/format-date-of-birth-input";
import { formatPhoneFaxInput, normalizePhoneFaxForSend } from "@/lib/fax/format-fax-phone-display";
import { buildFaxPacketPdf, formatPacketDate, isFaxPacketFile, MAX_PACKET_FILES } from "@/lib/fax/fax-packet-pdf";
import { supabase } from "@/lib/supabase/client";

const FAX_DOCUMENTS_BUCKET = "fax-documents";

type Toast = { type: "ok" | "err"; message: string };
type Step = FaxPacketStepId;

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
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);
  return storagePath;
}

function buildRecipientName(name: string, org: string): string | null {
  const n = name.trim();
  const o = org.trim();
  if (n && o) return `${n} · ${o}`;
  if (n) return n;
  if (o) return o;
  return null;
}

function pdfBytesToFile(pdfBytes: Uint8Array, filename: string): File {
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  return new File([copy], filename, { type: "application/pdf" });
}

async function fetchDocumentTemplateAttachmentFile(templateId: string): Promise<File | null> {
  const res = await fetch(
    `/api/fax/document-templates/${encodeURIComponent(templateId)}/attachment?format=json`
  );
  if (res.status === 404) return null;
  const data = (await res.json()) as {
    ok?: boolean;
    url?: string;
    fileName?: string | null;
    contentType?: string | null;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Could not load template attachment.");
  }
  const blobRes = await fetch(data.url);
  if (!blobRes.ok) throw new Error("Could not download template attachment.");
  const blob = await blobRes.blob();
  const name = data.fileName?.trim() || "template-attachment";
  const type = data.contentType?.trim() || blob.type || "application/octet-stream";
  return new File([blob], name, { type });
}

function buildCoverFields(input: {
  recipientName: string;
  recipientOrganization: string;
  recipientPhone: string;
  recipientFax: string;
  patientName: string;
  patientDob: string;
  subject: string;
  message: string;
  totalPages: string;
}): FaxCoverSheetFields {
  return {
    recipientName: input.recipientName,
    recipientOrganization: input.recipientOrganization,
    recipientPhone: input.recipientPhone,
    recipientFax: input.recipientFax,
    patientName: input.patientName,
    patientDob: input.patientDob,
    subject: input.subject,
    message: input.message,
    date: formatPacketDate(),
    totalPages: input.totalPages,
  };
}

export function NewFaxPacketButton() {
  const router = useRouter();
  const uploadId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("compose");
  const [sending, setSending] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingDocumentTemplates, setLoadingDocumentTemplates] = useState(false);
  const [loadingDocumentTemplate, setLoadingDocumentTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [templates, setTemplates] = useState<FaxCoverSheetTemplateRow[]>([]);
  const [documentTemplates, setDocumentTemplates] = useState<FaxDocumentTemplateRow[]>([]);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [documentTemplatesSchemaMissing, setDocumentTemplatesSchemaMissing] = useState(false);

  const [templateId, setTemplateId] = useState("");
  const [documentTemplateId, setDocumentTemplateId] = useState("");
  const [documentBodyText, setDocumentBodyText] = useState("");
  const [templateAttachmentFile, setTemplateAttachmentFile] = useState<File | null>(null);
  const [toFax, setToFax] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientOrganization, setRecipientOrganization] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [dragFileIndex, setDragFileIndex] = useState<number | null>(null);
  const [dragOverFileIndex, setDragOverFileIndex] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPageCount, setPreviewPageCount] = useState<number | null>(null);
  const [buildingPreview, setBuildingPreview] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const selectedDocumentTemplate = documentTemplates.find((t) => t.id === documentTemplateId) ?? null;
  const busy = sending || buildingPreview || loadingDocumentTemplate;

  const packetAttachmentFiles = [
    ...(templateAttachmentFile ? [templateAttachmentFile] : []),
    ...files,
  ];

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/fax/cover-templates");
      const data = (await res.json()) as {
        templates?: FaxCoverSheetTemplateRow[];
        schema_missing?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not load templates.");
      setSchemaMissing(Boolean(data.schema_missing));
      const list = data.templates ?? [];
      setTemplates(list);
      const def = list.find((t) => t.is_default) ?? list[0];
      if (def) {
        setTemplateId((prev) => prev || def.id);
        setSubject((prev) => (prev ? prev : def.default_subject));
        setMessage((prev) => (prev ? prev : def.default_message));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const loadDocumentTemplates = useCallback(async () => {
    setLoadingDocumentTemplates(true);
    try {
      const res = await fetch("/api/fax/document-templates");
      const data = (await res.json()) as {
        templates?: FaxDocumentTemplateRow[];
        schema_missing?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not load document templates.");
      setDocumentTemplatesSchemaMissing(Boolean(data.schema_missing));
      setDocumentTemplates(data.templates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load document templates.");
    } finally {
      setLoadingDocumentTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadTemplates();
    void loadDocumentTemplates();
  }, [open, loadTemplates, loadDocumentTemplates]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.type === "ok" ? 4500 : 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewPageCount(null);
  }

  function resetModal() {
    setStep("compose");
    setError(null);
    setFiles([]);
    setTemplateId("");
    setDocumentTemplateId("");
    setDocumentBodyText("");
    setTemplateAttachmentFile(null);
    setToFax("");
    setRecipientName("");
    setRecipientOrganization("");
    setRecipientPhone("");
    setPatientName("");
    setPatientDob("");
    setSubject("");
    setMessage("");
    clearPreview();
  }

  function closeModal() {
    if (!busy) {
      setOpen(false);
      resetModal();
    }
  }

  async function onDocumentTemplateChange(id: string) {
    setDocumentTemplateId(id);
    clearPreview();

    if (!id) {
      setDocumentBodyText("");
      setTemplateAttachmentFile(null);
      return;
    }

    const tpl = documentTemplates.find((t) => t.id === id);
    if (!tpl) return;

    setDocumentBodyText(tpl.body_content);
    setTemplateAttachmentFile(null);

    if (!tpl.attachment_storage_path) return;

    setLoadingDocumentTemplate(true);
    setError(null);
    try {
      const file = await fetchDocumentTemplateAttachmentFile(id);
      setTemplateAttachmentFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load template attachment.");
    } finally {
      setLoadingDocumentTemplate(false);
    }
  }

  function onTemplateChange(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.default_subject);
      setMessage(tpl.default_message);
    }
  }

  function addFilesFromList(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    const rejected = incoming.filter((f) => !isFaxPacketFile(f));
    const accepted = incoming.filter((f) => isFaxPacketFile(f));
    if (rejected.length > 0) setError("Only PDF, JPEG, and PNG files are supported.");
    else setError(null);
    if (accepted.length === 0) return;
    setFiles((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > MAX_PACKET_FILES) {
        setError(`You can attach up to ${MAX_PACKET_FILES} files.`);
        return next.slice(0, MAX_PACKET_FILES);
      }
      return next;
    });
    clearPreview();
  }

  function moveFile(index: number, direction: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    clearPreview();
  }

  function reorderFiles(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
    clearPreview();
  }

  function removeFileAt(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    clearPreview();
  }

  function coverInput(totalPages: string) {
    return buildCoverFields({
      recipientName,
      recipientOrganization,
      recipientPhone,
      recipientFax: toFax,
      patientName,
      patientDob,
      subject,
      message,
      totalPages,
    });
  }

  function validateCompose(): boolean {
    if (!normalizePhoneFaxForSend(toFax)) {
      setError("Enter a valid destination fax number.");
      return false;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return false;
    }
    if (!templateId) {
      setError("Select a cover sheet template.");
      return false;
    }
    setError(null);
    return true;
  }

  function validatePacketContent(): boolean {
    const hasBody = documentBodyText.trim().length > 0;
    const hasAttachments = packetAttachmentFiles.length > 0;
    if (hasBody || hasAttachments) {
      setError(null);
      return true;
    }
    setError("Add document text, select a template with content, or upload at least one attachment.");
    return false;
  }

  async function buildPreview() {
    if (!validateCompose() || !validatePacketContent()) return;
    setBuildingPreview(true);
    setError(null);
    try {
      const draft = await buildFaxPacketPdf({
        coverFields: coverInput("—"),
        templateTitle: selectedTemplate?.name,
        documentBodyText,
        documentBodyTitle: selectedDocumentTemplate?.name,
        attachmentFiles: packetAttachmentFiles,
      });
      const finalPacket = await buildFaxPacketPdf({
        coverFields: coverInput(String(draft.pageCount)),
        templateTitle: selectedTemplate?.name,
        documentBodyText,
        documentBodyTitle: selectedDocumentTemplate?.name,
        attachmentFiles: packetAttachmentFiles,
      });
      clearPreview();
      setPreviewUrl(URL.createObjectURL(new Blob([finalPacket.pdfBytes.slice()], { type: "application/pdf" })));
      setPreviewPageCount(finalPacket.pageCount);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build preview.");
    } finally {
      setBuildingPreview(false);
    }
  }

  async function handleSend() {
    if (!validateCompose() || !validatePacketContent()) return;
    const toNumber = normalizePhoneFaxForSend(toFax);
    if (!toNumber) return;

    setSending(true);
    setError(null);
    try {
      const pageCount =
        previewPageCount ??
        (
          await buildFaxPacketPdf({
            coverFields: coverInput("—"),
            templateTitle: selectedTemplate?.name,
            documentBodyText,
            documentBodyTitle: selectedDocumentTemplate?.name,
            attachmentFiles: packetAttachmentFiles,
          })
        ).pageCount;

      const { pdfBytes } = await buildFaxPacketPdf({
        coverFields: coverInput(String(pageCount)),
        templateTitle: selectedTemplate?.name,
        documentBodyText,
        documentBodyTitle: selectedDocumentTemplate?.name,
        attachmentFiles: packetAttachmentFiles,
      });

      const storagePath = await uploadFaxPdf(pdfBytesToFile(pdfBytes, "fax-packet.pdf"));

      const packetMetadata: FaxPacketMetadata = {
        recipient_organization: recipientOrganization.trim() || null,
        recipient_phone: recipientPhone.trim() || null,
        recipient_fax: toFax.trim() || null,
        patient_name: patientName.trim() || null,
        patient_dob: patientDob.trim() || null,
        message: message.trim() || null,
        cover_sheet_template_id: templateId,
        cover_sheet_template_name: selectedTemplate?.name ?? null,
        document_template_id: documentTemplateId || null,
        document_template_name: selectedDocumentTemplate?.name ?? null,
      };

      const noteParts = [
        `Fax packet: ${selectedTemplate?.name ?? "cover sheet"}.`,
        selectedDocumentTemplate?.name ? `Document: ${selectedDocumentTemplate.name}.` : null,
        patientName.trim() ? `Patient: ${patientName.trim()}.` : null,
        patientDob.trim() ? `DOB: ${patientDob.trim()}.` : null,
      ].filter(Boolean);

      const res = await fetch("/api/fax/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toNumber,
          storage_path: storagePath,
          subject: subject.trim(),
          recipient_name: buildRecipientName(recipientName, recipientOrganization),
          cover_sheet_template_id: templateId,
          packet_metadata: packetMetadata,
          page_count: pageCount,
          category: "orders",
          tags: ["fax_packet"],
          note: noteParts.join(" "),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Fax send failed (${res.status}).`);
      }

      setOpen(false);
      resetModal();
      setToast({ type: "ok", message: "Fax packet sent" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fax send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {toast ? <FaxToast type={toast.type} message={toast.message} /> : null}

      <button type="button" className={faxUi.triggerBtn} onClick={() => setOpen(true)}>
        New Fax Packet
      </button>

      {open ? (
        <div className={faxUi.overlay} role="dialog" aria-modal="true" aria-labelledby="fax-packet-title">
          <div className={faxUi.modal}>
            <FaxPacketModalHeader onClose={closeModal} busy={busy} step={step} />

            <div className={faxUi.modalBody}>
              {documentTemplatesSchemaMissing ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Apply the fax document templates migration to use saved document templates in packets.
                </div>
              ) : null}

              {schemaMissing ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Apply the fax cover sheet migration to enable templates.
                </div>
              ) : null}

              {error ? (
                <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {error}
                </div>
              ) : null}

              {step === "compose" ? (
                <div className="space-y-5">
                  <FaxSection title="Cover sheet template" hint="Subject and message auto-fill from your selection.">
                  <FaxField label="Template" required>
                    <select
                      value={templateId}
                      disabled={busy || loadingTemplates}
                      onChange={(e) => onTemplateChange(e.target.value)}
                      className={faxUi.input}
                    >
                      <option value="">{loadingTemplates ? "Loading…" : "Select template"}</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </FaxField>
                  <p className="text-xs text-slate-500">
                    Return fax on cover sheet: <span className="font-semibold text-slate-800">{SAINTLY_RETURN_FAX_DISPLAY}</span>
                    {" · "}
                    <Link href="/admin/fax/templates" className="font-semibold text-sky-700 hover:underline">
                      Manage templates
                    </Link>
                  </p>
                  </FaxSection>

                  <FaxSection title="Recipient & patient" hint="Information printed on the cover sheet for the receiving office.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700 sm:col-span-2">
                      Recipient fax <span className="text-rose-600">*</span>
                      <input
                        type="tel"
                        value={toFax}
                        onChange={(e) => setToFax(formatPhoneFaxInput(e.target.value))}
                        onPaste={(e) => {
                          e.preventDefault();
                          setToFax(formatPhoneFaxInput(e.clipboardData.getData("text")));
                        }}
                        disabled={busy}
                        placeholder="(480) 555-1212"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={14}
                        className={faxUi.input}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                      Recipient name
                      <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} disabled={busy} className={faxUi.input} />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                      Recipient organization
                      <input
                        value={recipientOrganization}
                        onChange={(e) => setRecipientOrganization(e.target.value)}
                        disabled={busy}
                        className={faxUi.input}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                      Recipient phone
                      <input
                        type="tel"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(formatPhoneFaxInput(e.target.value))}
                        onPaste={(e) => {
                          e.preventDefault();
                          setRecipientPhone(formatPhoneFaxInput(e.clipboardData.getData("text")));
                        }}
                        disabled={busy}
                        placeholder="(480) 555-1212"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={14}
                        className={faxUi.input}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                      Patient name
                      <input value={patientName} onChange={(e) => setPatientName(e.target.value)} disabled={busy} className={faxUi.input} />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
                      Patient DOB
                      <input
                        value={patientDob}
                        onChange={(e) => setPatientDob(formatDateOfBirthInput(e.target.value))}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pasted = e.clipboardData.getData("text");
                          setPatientDob(formatDateOfBirthInput(pasted));
                        }}
                        disabled={busy}
                        placeholder="MM/DD/YYYY"
                        inputMode="numeric"
                        autoComplete="bday"
                        maxLength={10}
                        className={faxUi.input}
                      />
                      <span className="text-[10px] font-normal text-slate-500">MM/DD/YYYY</span>
                    </label>
                  </div>
                  </FaxSection>

                  <FaxSection title="Cover message" hint="Appears on the fax cover sheet sent to the physician office.">
                  <FaxField label="Subject" required>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} className={faxUi.input} />
                  </FaxField>
                  <FaxField label="Message">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      disabled={busy}
                      rows={4}
                      className={faxUi.textarea}
                    />
                  </FaxField>
                  </FaxSection>
                </div>
              ) : null}

              {step === "attachments" ? (
                <div className="space-y-5">
                  <FaxSection
                    title="Document template"
                    hint="Load saved clinical document text. You can edit it before sending. Attachments from the template are optional."
                  >
                    <FaxField label="Use document template">
                      <select
                        value={documentTemplateId}
                        disabled={busy || loadingDocumentTemplates}
                        onChange={(e) => void onDocumentTemplateChange(e.target.value)}
                        className={faxUi.select}
                      >
                        <option value="">
                          {loadingDocumentTemplates ? "Loading…" : "None — paste or upload below"}
                        </option>
                        {documentTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </FaxField>
                    <p className="text-xs text-slate-500">
                      <Link href="/admin/fax/document-templates" className="font-semibold text-sky-700 hover:underline">
                        Manage document templates
                      </Link>
                      {loadingDocumentTemplate ? " · Loading template attachment…" : null}
                    </p>
                    <FaxField label="Document body">
                      <textarea
                        value={documentBodyText}
                        onChange={(e) => {
                          setDocumentBodyText(e.target.value);
                          clearPreview();
                        }}
                        disabled={busy}
                        rows={14}
                        className={faxUi.textarea}
                        placeholder="Paste or edit document text here. It will be included as readable PDF pages in the fax packet."
                        spellCheck={false}
                      />
                    </FaxField>
                    <p className={faxUi.sectionHint}>
                      Line breaks are preserved. Document text can be sent without uploading any additional files.
                    </p>
                  </FaxSection>

                  <FaxSection
                    title="Additional attachments"
                    hint={
                      documentBodyText.trim()
                        ? "Optional PDF, JPEG, or PNG files. Drag rows to set page order after the cover sheet and document body."
                        : "PDF, JPEG, or PNG. Drag rows to set page order after the cover sheet and document body."
                    }
                  >
                  {templateAttachmentFile ? (
                    <div className={`${faxUi.fileRow} mb-3`}>
                      <span className="min-w-0 break-all text-slate-800">
                        <span className="mr-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">
                          Template
                        </span>
                        {templateAttachmentFile.name}
                      </span>
                      <button
                        type="button"
                        className={faxUi.btnGhost}
                        disabled={busy}
                        onClick={() => {
                          setTemplateAttachmentFile(null);
                          clearPreview();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                  <input
                    ref={fileInputRef}
                    id={`${uploadId}-file`}
                    type="file"
                    accept="application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png"
                    multiple
                    disabled={busy}
                    className="sr-only"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      if (e.target.files?.length) addFilesFromList(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <label
                    htmlFor={`${uploadId}-file`}
                    onDragOver={(e: DragEvent) => e.preventDefault()}
                    onDragEnter={(e: DragEvent) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={(e: DragEvent) => {
                      e.preventDefault();
                      if (e.currentTarget === e.target) setDragActive(false);
                    }}
                    onDrop={(e: DragEvent) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files?.length) addFilesFromList(e.dataTransfer.files);
                    }}
                    className={`${faxUi.uploadZone} ${dragActive ? faxUi.uploadZoneActive : ""} ${busy ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <span className="text-sm font-semibold text-slate-900">Drag and drop files here</span>
                    <span className="mt-1 text-sm text-slate-600">or click to upload</span>
                  </label>
                  {files.length > 0 ? (
                    <ul className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                      {files.map((file, index) => (
                        <li
                          key={`${file.name}-${file.size}-${index}`}
                          draggable={!busy}
                          onDragStart={() => setDragFileIndex(index)}
                          onDragEnd={() => {
                            setDragFileIndex(null);
                            setDragOverFileIndex(null);
                          }}
                          onDragOver={(e: DragEvent) => {
                            e.preventDefault();
                            setDragOverFileIndex(index);
                          }}
                          onDragLeave={() => {
                            setDragOverFileIndex((cur) => (cur === index ? null : cur));
                          }}
                          onDrop={(e: DragEvent) => {
                            e.preventDefault();
                            if (dragFileIndex !== null) reorderFiles(dragFileIndex, index);
                            setDragFileIndex(null);
                            setDragOverFileIndex(null);
                          }}
                          className={`${faxUi.fileRow} ${
                            dragOverFileIndex === index && dragFileIndex !== index ? faxUi.fileRowOver : ""
                          } ${dragFileIndex === index ? "opacity-60" : ""}`}
                        >
                          <span className="flex min-w-0 items-center gap-2 text-slate-800">
                            <span className="shrink-0 text-slate-400" aria-hidden>
                              ⋮⋮
                            </span>
                            <span className="break-all">{file.name}</span>
                          </span>
                          <PacketFileActions
                            busy={busy}
                            index={index}
                            total={files.length}
                            onUp={() => moveFile(index, -1)}
                            onDown={() => moveFile(index, 1)}
                            onRemove={() => removeFileAt(index)}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  </FaxSection>
                </div>
              ) : null}

              {step === "preview" ? (
                <FaxSection title="Review packet" hint="Confirm the cover sheet, document body, and attachments before sending.">
                  {previewPageCount != null ? (
                    <p className="text-sm font-semibold text-slate-700">Total pages: {previewPageCount}</p>
                  ) : null}
                  {previewUrl ? (
                    <iframe title="Fax packet preview" src={previewUrl} className={faxUi.previewFrame} />
                  ) : (
                    <p className="text-sm text-slate-500">No preview available.</p>
                  )}
                </FaxSection>
              ) : null}
            </div>

            <footer className={faxUi.modalFooter}>
              <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={faxUi.btnGhost} onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              {step === "attachments" ? (
                <button
                  type="button"
                  className={faxUi.btnSecondary}
                  disabled={busy}
                  onClick={() => setStep("compose")}
                >
                  Back
                </button>
              ) : null}
              {step === "preview" ? (
                <button type="button" className={faxUi.btnSecondary} disabled={busy} onClick={() => setStep("attachments")}>
                  Back
                </button>
              ) : null}
              {step === "compose" ? (
                <button
                  type="button"
                  className={faxUi.btnPrimary}
                  disabled={busy}
                  onClick={() => {
                    if (validateCompose()) setStep("attachments");
                  }}
                >
                  Next: document & attachments
                </button>
              ) : null}
              {step === "attachments" ? (
                <button type="button" className={faxUi.btnPrimary} disabled={busy} onClick={() => void buildPreview()}>
                  {buildingPreview ? "Building preview…" : "Preview packet"}
                </button>
              ) : null}
              {step === "preview" ? (
                <button type="button" className={faxUi.btnSend} disabled={busy} onClick={() => void handleSend()}>
                  {sending ? "Sending…" : "Send fax packet"}
                </button>
              ) : null}
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function FaxPacketModalHeader({
  onClose,
  busy,
  step,
}: {
  onClose: () => void;
  busy: boolean;
  step: Step;
}) {
  return (
    <header className={faxUi.modalHeader}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <SaintlyLogoMark size={44} />
          <div>
            <p id="fax-packet-title" className="text-lg font-bold tracking-tight text-slate-900">
              New Fax Packet
            </p>
            <p className="mt-0.5 text-sm text-slate-600">Professional cover sheet and attachments for physician offices.</p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-xl px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-white/80"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <FaxPacketStepIndicator current={step} />
    </header>
  );
}

function PacketFileActions({
  busy,
  index,
  total,
  onUp,
  onDown,
  onRemove,
}: {
  busy: boolean;
  index: number;
  total: number;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={faxUi.btnGhost} disabled={busy || index === 0} onClick={onUp}>
        ↑
      </button>
      <button type="button" className={faxUi.btnGhost} disabled={busy || index === total - 1} onClick={onDown}>
        ↓
      </button>
      <button type="button" className={faxUi.btnGhost} disabled={busy} onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}
