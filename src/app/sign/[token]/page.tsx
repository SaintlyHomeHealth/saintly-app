"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import {
  PdfSigningCanvas,
  type PdfSigningCanvasField,
  type PdfSigningCanvasHandle,
} from "@/components/pdf-sign/PdfSigningCanvas";

type Field = {
  fieldKey: string;
  label: string;
  fieldType: string;
  optional: boolean;
  value: string | boolean | null;
  order: number;
};

type LoadPayload = {
  documentTitle: string;
  documentType: string;
  packetStatus: string;
  fields: Field[];
  canvasFields: PdfSigningCanvasField[];
  w9CertificationText: string | null;
  signedAt: string | null;
  recipientEmail: string;
  recipientDisplayName: string | null;
  hasCompletedPdf: boolean;
};

const ZOOM_PRESETS = [0.75, 0.9, 1, 1.25, 1.5] as const;

export default function PublicPdfSignPage() {
  const params = useParams();
  const token = decodeURIComponent(String(params?.token ?? "")).trim();

  const [data, setData] = useState<LoadPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [recipientSignatureImages, setRecipientSignatureImages] = useState<
    Record<string, string | undefined>
  >({});
  /** Bumps after successful draft save so the PDF reloads merged preview. */
  const [previewRev, setPreviewRev] = useState(0);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<PdfSigningCanvasHandle | null>(null);

  const docUrl = token
    ? `/api/pdf-sign/public/recipient/${encodeURIComponent(token)}/document`
    : "";
  const pdfSrc = docUrl ? `${docUrl}?previewRev=${encodeURIComponent(String(previewRev))}` : "";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/pdf-sign/recipient/${encodeURIComponent(token)}`);
      const j = (await res.json()) as LoadPayload & { error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setErr(j.error ?? "Could not load document.");
        return;
      }
      setData(j);
      const init: Record<string, string | boolean> = {};
      for (const f of j.fields) {
        if (f.fieldType === "checkbox") {
          init[f.fieldKey] = Boolean(f.value === true || f.value === "true");
        } else {
          init[f.fieldKey] = typeof f.value === "string" ? f.value : "";
        }
      }
      setValues(init);
      setRecipientSignatureImages({});
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const sortedFields = useMemo(() => {
    if (!data) return [];
    return [...data.fields].sort((a, b) => a.order - b.order);
  }, [data]);

  const canvasFieldList = useMemo(() => data?.canvasFields ?? [], [data?.canvasFields]);

  const signerNameHint =
    typeof data?.recipientDisplayName === "string" ? data.recipientDisplayName.trim() : "";

  function stripUnsafeSignatureValuesForDraft(
    v: Record<string, string | boolean>
  ): Record<string, string | boolean> {
    const copy = { ...v };
    for (const f of sortedFields) {
      if (f.fieldType === "signature" || f.fieldType === "initials") {
        const cur = copy[f.fieldKey];
        if (typeof cur === "string" && cur.startsWith("data:image")) delete copy[f.fieldKey];
      }
    }
    return copy;
  }

  async function saveDraft() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    const payload = stripUnsafeSignatureValuesForDraft(values);
    const res = await fetch(`/api/pdf-sign/recipient/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: payload, finalize: false }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Could not save. Please try again.");
    } else {
      setPreviewRev((r) => r + 1);
    }
    setBusy(false);
  }

  async function finalize(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setErr(null);
    const sanitized: Record<string, string | boolean> = { ...values };
    for (const f of sortedFields) {
      if (f.fieldType === "signature" || f.fieldType === "initials") {
        const cur = sanitized[f.fieldKey];
        if (typeof cur === "string" && cur.startsWith("data:image")) delete sanitized[f.fieldKey];
      }
    }
    const imgs: Record<string, string> = {};
    for (const [k, v] of Object.entries(recipientSignatureImages)) {
      if (typeof v === "string" && v.startsWith("data:image")) imgs[k] = v;
    }
    const res = await fetch(`/api/pdf-sign/recipient/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        values: sanitized,
        finalize: true,
        recipientSignatureImages: imgs,
      }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Could not complete signing.");
      setBusy(false);
      return;
    }
    const reload = await fetch(`/api/pdf-sign/recipient/${encodeURIComponent(token)}`);
    const jj = (await reload.json()) as LoadPayload & { error?: string };
    if (!reload.ok) setErr(jj.error ?? "Signed, but reload failed.");
    else setData(jj);
    setBusy(false);
  }

  if (!token)
    return <div className="p-8 text-center text-slate-600">Invalid link.</div>;
  if (err && !data) return <div className="p-8 text-center text-red-700">{err}</div>;
  if (!data)
    return <div className="p-8 text-center text-slate-600">Loading…</div>;

  const isDone = Boolean(data.signedAt || data.packetStatus === "completed" || data.packetStatus === "signed");
  const unsignedDownloadHref = pdfSrc ? `${pdfSrc}&download=1` : "";
  const signedViewHref = `${docUrl}?completed=1`;
  const signedDownloadHref = `${docUrl}?completed=1&download=1`;

  if (isDone) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-12">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            Document signed successfully
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Thank you — your submission is complete.{data.documentTitle ? ` (${data.documentTitle})` : ""}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href={signedDownloadHref}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Download signed copy
            </a>
            <a
              href={signedViewHref}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              View signed PDF
            </a>
          </div>
          {data.hasCompletedPdf ? null : (
            <p className="mt-4 text-xs text-amber-800">
              Signed PDF generation may take a moment. If download fails, try again shortly.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-slate-100 via-white to-sky-50/50">
      {/* Sticky signing toolbar — document-first workspace */}
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm backdrop-blur-md sm:px-5 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Sign your document
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Complete fields on the PDF below.
              {data.documentTitle ? (
                <>
                  {" "}
                  <span className="font-medium text-slate-800">{data.documentTitle}</span>.
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Zoom</span>
              {ZOOM_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={
                    "rounded-md px-2 py-1 text-xs font-semibold " +
                    (Math.abs(zoom - p) < 0.02
                      ? "bg-indigo-100 text-indigo-950"
                      : "text-slate-700 hover:bg-white")
                  }
                  onClick={() => setZoom(p)}
                >
                  {Math.round(p * 100)}%
                </button>
              ))}
              <button
                type="button"
                className="ml-1 rounded-md px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-white"
                onClick={() => setZoom(1)}
              >
                Fit width
              </button>
            </div>
            <a
              href={unsignedDownloadHref}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Download draft
            </a>
            <button
              type="button"
              onClick={() => canvasRef.current?.goToNextRequired()}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Next required
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-none flex-1 flex-col px-2 py-4 sm:px-4 lg:max-w-[min(1600px,100%)] lg:px-6">
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/40 p-2 shadow-inner sm:p-4 lg:min-h-[min(calc(100dvh-11rem),900px)] lg:max-h-[calc(100dvh-9rem)]"
        >
          {pdfSrc && canvasFieldList.length > 0 ? (
            <PdfSigningCanvas
              ref={canvasRef}
              pdfUrl={pdfSrc}
              fields={canvasFieldList}
              mode="recipient"
              recipientDisplayName={signerNameHint}
              textValues={values}
              onTextChange={(k, v) =>
                setValues((prev) => {
                  const cf = canvasFieldList.find((x) => x.field_key === k);
                  if (!cf) return prev;
                  return { ...prev, [k]: v };
                })
              }
              signatureImages={recipientSignatureImages}
              onSignatureApply={(fieldKey, payload) => {
                if (payload.imageDataUrl) {
                  setRecipientSignatureImages((prev) => ({
                    ...prev,
                    [fieldKey]: payload.imageDataUrl as string,
                  }));
                }
                if (payload.typed) {
                  setValues((prev) => ({ ...prev, [fieldKey]: payload.typed as string }));
                }
              }}
              zoom={zoom}
            />
          ) : (
            <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-600">
              Preparing document…
            </p>
          )}
        </div>

        {data.documentType === "w9" && data.w9CertificationText ? (
          <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-950 shadow-sm sm:p-5">
            <div className="font-semibold">Certification (read carefully)</div>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{data.w9CertificationText}</p>
          </section>
        ) : null}

        {err ? <p className="mt-3 text-center text-sm text-rose-700">{err}</p> : null}

        <form
          onSubmit={finalize}
          className="sticky bottom-0 z-30 mt-4 flex flex-col gap-3 border-t border-slate-200/90 bg-white/95 py-4 backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        >
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Save progress
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Sign & submit"}
          </button>
        </form>
      </div>
    </div>
  );
}
