"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  PdfSigningCanvas,
  type PdfSigningCanvasField,
  type PdfSigningCanvasHandle,
} from "@/components/pdf-sign/PdfSigningCanvas";
import {
  collectSaintlySenderPrefillIssues,
  formatSaintlySendFieldHeading,
  senderAssignableTemplateFields,
} from "@/lib/pdf-sign/validate-sender-prefill";
import { signerPartyFromField } from "@/lib/pdf-sign/normalize";

const BTN_GOLD_PRIMARY =
  "inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50";

export type Step4TemplateField = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  signer_role: string | null;
  required: boolean | null;
  options: Record<string, unknown> | null;
  page_index: number | null | undefined;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  font_size: number | null;
  required_order: number | null;
};

type RecipientRow = { id: string; name: string; email: string; phone: string };

function toCanvasFields(rows: Step4TemplateField[]): PdfSigningCanvasField[] {
  return rows.map((f) => ({
    id: f.id,
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    signer_role: f.signer_role,
    required: f.required,
    options: f.options,
    page_index: typeof f.page_index === "number" ? f.page_index : 0,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    font_size: f.font_size,
    required_order: typeof f.required_order === "number" ? f.required_order : 0,
  }));
}

export function SendPacketStep4Review({
  templateName,
  documentLabel,
  templateFields,
  templatePdfUrl,
  previewNonce,
  primaryRecipients,
  recordTypeLabel,
  crmEntityId,
  hasLinkedProfile,
  ttlDays,
  sendEmail,
  message,
  smsRequested,
  marksIc,
  senderDisplayName,
  senderValues,
  setSenderValues,
  senderSignatures,
  setSenderSignatures,
  pulseFieldKey,
  goBack,
  busy,
  downloadUrl,
  onRefreshPreview,
}: {
  templateName: string;
  documentLabel: string;
  templateFields: Step4TemplateField[];
  templatePdfUrl: string | null;
  previewNonce: number;
  primaryRecipients: RecipientRow[];
  recordTypeLabel: string;
  crmEntityId: string;
  hasLinkedProfile: boolean;
  ttlDays: number;
  sendEmail: boolean;
  message: string;
  smsRequested: boolean;
  marksIc: boolean;
  senderDisplayName: string;
  senderValues: Record<string, string | boolean>;
  setSenderValues: React.Dispatch<React.SetStateAction<Record<string, string | boolean>>>;
  senderSignatures: Record<string, string>;
  setSenderSignatures: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  pulseFieldKey: string | null;
  goBack: () => void;
  busy: boolean;
  downloadUrl: string;
  onRefreshPreview: () => void;
}) {
  const canvasRef = useRef<PdfSigningCanvasHandle | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  const templateModels = useMemo(
    () =>
      templateFields.map((f) => ({
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type,
        signer_role: f.signer_role,
        options: f.options,
        required: f.required,
        page_index: typeof f.page_index === "number" ? f.page_index : null,
      })),
    [templateFields]
  );

  const senderSideFields = useMemo(() => senderAssignableTemplateFields(templateModels), [templateModels]);
  const hasSaintlySenderFields = senderSideFields.length > 0;

  const canvasFields = useMemo(() => toCanvasFields(templateFields), [templateFields]);

  const checklist = useMemo(() => {
    return senderSideFields.map((f) => ({
      key: f.field_key,
      heading: formatSaintlySendFieldHeading({
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type,
        signer_role: f.signer_role,
        options: f.options,
        required: f.required,
        page_index: typeof f.page_index === "number" ? f.page_index : null,
      }),
    }));
  }, [senderSideFields]);

  useEffect(() => {
    if (!pulseFieldKey) return;
    canvasRef.current?.scrollToField(pulseFieldKey);
  }, [pulseFieldKey]);

  function resetSenderFields() {
    const nextVals = { ...senderValues };
    const nextSigs = { ...senderSignatures };
    for (const f of templateFields) {
      if (signerPartyFromField(f) !== "sender") continue;
      delete nextVals[f.field_key];
      delete nextSigs[f.field_key];
    }
    setSenderValues(nextVals);
    setSenderSignatures(nextSigs);
  }

  const primary = primaryRecipients[0];

  const saintlyBlockers = useMemo(
    () =>
      collectSaintlySenderPrefillIssues({
        templateFields: templateModels,
        senderValues,
        senderSignatureImages: senderSignatures,
      }),
    [templateModels, senderValues, senderSignatures]
  );
  const sendBlocked = saintlyBlockers.length > 0;

  return (
    <section className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-md shadow-slate-200/40 ring-1 ring-slate-100/80 md:p-6">
      {/* Top toolbar */}
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Back
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{templateName}</p>
            <p className="truncate text-xs text-slate-500">
              {primary?.name || "Signer"} · {primary?.email || "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1 py-1">
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-white"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
            >
              −
            </button>
            <span className="min-w-[3.25rem] text-center text-xs font-semibold text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-white"
              onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}
            >
              +
            </button>
            <button
              type="button"
              className="ml-1 rounded-lg px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-white"
              onClick={() => setZoom(1)}
            >
              Fit width
            </button>
          </div>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Download
          </a>
          <button
            type="button"
            onClick={onRefreshPreview}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-3 lg:hidden">
        <button
          type="button"
          onClick={() => canvasRef.current?.goToNextRequired()}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md"
        >
          Next required Saintly field
        </button>
        <button
          type="button"
          onClick={() => setMobileSummaryOpen((o) => !o)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800"
        >
          {mobileSummaryOpen ? "Hide details" : "Packet summary & settings"}
        </button>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-slate-700">
        <span className="font-semibold text-slate-900">Complete Saintly fields directly on the document.</span>{" "}
        Recipient fields stay marked for the signer—they are not editable here.
      </p>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(260px,320px)] lg:items-stretch">
        {/* Left rail */}
        <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Saintly checklist</p>
            <ul className="mt-2 max-h-[45vh] space-y-2 overflow-auto text-xs text-slate-800">
              {checklist.length === 0 ? (
                <li className="text-slate-500">No Saintly fields on this template.</li>
              ) : (
                checklist.map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.scrollToField(c.key)}
                      className="w-full rounded-lg border border-transparent px-2 py-1.5 text-left hover:border-amber-200 hover:bg-white"
                    >
                      {c.heading}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
          {hasSaintlySenderFields ? (
            <button
              type="button"
              onClick={resetSenderFields}
              className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-100"
            >
              Reset Saintly field answers
            </button>
          ) : null}
        </aside>

        {/* Center — PDF */}
        <div className="flex min-h-[420px] min-w-0 flex-col lg:min-h-[560px]">
          {templatePdfUrl ? (
            <PdfSigningCanvas
              key={`${previewNonce}-${templatePdfUrl}`}
              ref={canvasRef}
              pdfUrl={templatePdfUrl}
              fields={canvasFields}
              mode="admin_sender"
              senderDisplayName={senderDisplayName}
              textValues={senderValues}
              onTextChange={(k, v) =>
                setSenderValues((prev) => {
                  const f = templateFields.find((x) => x.field_key === k);
                  if (!f || signerPartyFromField(f) !== "sender") return prev;
                  return { ...prev, [k]: v };
                })
              }
              signatureImages={senderSignatures}
              onSignatureApply={(fieldKey, payload) => {
                const f = templateFields.find((x) => x.field_key === fieldKey);
                if (!f || signerPartyFromField(f) !== "sender") return;
                if (payload.imageDataUrl) {
                  setSenderSignatures((prev) => ({ ...prev, [fieldKey]: payload.imageDataUrl as string }));
                }
                if (payload.typed) {
                  setSenderValues((prev) => ({ ...prev, [fieldKey]: payload.typed as string }));
                }
              }}
              highlightFieldKey={pulseFieldKey}
              zoom={zoom}
            />
          ) : (
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-6 text-sm text-amber-950">
              PDF preview URL unavailable. Go back and re-select the template.
            </div>
          )}
        </div>

        {/* Right summary */}
        <aside
          className={
            "min-h-0 space-y-3 lg:flex lg:flex-col " +
            (mobileSummaryOpen ? "flex" : "hidden lg:flex")
          }
        >
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Packet summary</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Document</dt>
                <dd className="text-right font-medium text-slate-900">{documentLabel}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Recipients</dt>
                <dd className="mt-1 text-right text-slate-900">
                  {primaryRecipients.map((r) => (
                    <div key={r.id} className="leading-snug">
                      <div className="font-medium">{r.name || "—"}</div>
                      <div className="text-xs text-slate-600">{r.email}</div>
                    </div>
                  ))}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-slate-100 pt-2">
                <dt className="text-slate-500">CRM</dt>
                <dd className="text-right text-slate-900">
                  {hasLinkedProfile ? (
                    <>
                      {recordTypeLabel}
                      <div className="text-xs text-slate-600">{crmEntityId.trim()}</div>
                    </>
                  ) : (
                    <span>Manual send</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Link</dt>
                <dd className="text-right text-slate-900">
                  Expires {ttlDays}d · {sendEmail ? "Email now" : "Hold"}
                </dd>
              </div>
            </dl>
            {message.trim() ? (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Note: </span>
                {message}
              </p>
            ) : null}
            {(smsRequested || marksIc) && (
              <p className="mt-2 text-xs text-slate-500">
                {smsRequested ? "SMS requested · " : null}
                {marksIc ? "IC agreement" : null}
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom bar */}
      <div className="sticky bottom-0 z-20 mt-6 flex flex-col gap-3 border-t border-slate-200/90 bg-white/95 pt-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={goBack}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Back
          </button>
          <Link
            href="/admin/signatures/packets"
            className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-600 underline-offset-2 hover:underline"
          >
            Cancel
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {sendBlocked ? (
            <p className="text-xs font-medium text-rose-700">Complete required Saintly fields on the PDF to send.</p>
          ) : (
            <p className="text-xs font-medium text-emerald-800">Ready to send</p>
          )}
          <button
            type="submit"
            disabled={busy || sendBlocked}
            className={`${BTN_GOLD_PRIMARY} px-8 py-3 text-base`}
          >
            {busy ? "Sending…" : "Send packet"}
          </button>
        </div>
      </div>
    </section>
  );
}
