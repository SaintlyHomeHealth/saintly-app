"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { SignaturePadModal } from "./SignaturePadModal";

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
  w9CertificationText: string | null;
  signedAt: string | null;
  recipientEmail: string;
  recipientDisplayName: string | null;
  hasCompletedPdf: boolean;
};

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
  const [sigModalField, setSigModalField] = useState<Field | null>(null);
  const [docPreviewOpenMobile, setDocPreviewOpenMobile] = useState(true);
  /** Bumps after successful draft save so the iframe reloads merged preview PDF. */
  const [previewRev, setPreviewRev] = useState(0);

  const docUrl = token
    ? `/api/pdf-sign/public/recipient/${encodeURIComponent(token)}/document`
    : "";
  /** Cache-busting param; handlers ignore unknown query keys. */
  const previewIframeSrc =
    docUrl === "" ? "" : `${docUrl}?previewRev=${encodeURIComponent(String(previewRev))}`;
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

  function applySignature(payload: {
    fieldKey: string;
    typed: string | null;
    imageDataUrl: string | null;
  }) {
    setRecipientSignatureImages((prev) =>
      payload.imageDataUrl ? { ...prev, [payload.fieldKey]: payload.imageDataUrl } : prev
    );
    if (payload.typed?.trim())
      setValues((v) => ({ ...v, [payload.fieldKey]: payload.typed!.trim() }));
  }

  if (!token)
    return <div className="p-8 text-center text-slate-600">Invalid link.</div>;
  if (err && !data) return <div className="p-8 text-center text-red-700">{err}</div>;
  if (!data)
    return <div className="p-8 text-center text-slate-600">Loading…</div>;

  const isDone = Boolean(data.signedAt || data.packetStatus === "completed" || data.packetStatus === "signed");
  const unsignedDownloadHref = previewIframeSrc ? `${previewIframeSrc}&download=1` : "";
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
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 max-w-xl lg:max-w-none">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Review and sign document
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Please review the document before signing.
            {data.documentTitle ? (
              <>
                {" "}
                <span className="font-medium text-slate-800">{data.documentTitle}</span>.
              </>
            ) : null}
          </p>
        </header>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
          <section className="order-first flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 lg:flex-nowrap">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Document preview
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={unsignedDownloadHref}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Download document
                </a>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 lg:hidden"
                  onClick={() => setDocPreviewOpenMobile((o) => !o)}
                  aria-expanded={docPreviewOpenMobile}
                >
                  {docPreviewOpenMobile ? "Hide document" : "View document"}
                </button>
              </div>
            </div>

            <div
              className={
                "relative w-full overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200 " +
                (docPreviewOpenMobile ? "block" : "hidden lg:block") +
                " lg:min-h-[min(640px,75vh)]"
              }
            >
              <iframe
                title="PDF preview"
                src={previewIframeSrc}
                className={
                  "h-[min(520px,70vh)] w-full border-0 lg:h-[min(640px,75vh)]"
                }
              />
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Showing Saintly‑completed fields plus your edits so far (signatures appear after you
              apply them).
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <form onSubmit={finalize} className="space-y-4">
              {sortedFields.map((f) => {
                if (f.fieldType === "checkbox") {
                  return (
                    <label key={f.fieldKey} className="flex items-start gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-slate-300 text-slate-900"
                        checked={Boolean(values[f.fieldKey])}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.fieldKey]: e.target.checked }))
                        }
                      />
                      <span>{f.label}</span>
                    </label>
                  );
                }
                if (f.fieldType === "signature" || f.fieldType === "initials") {
                  const png = recipientSignatureImages[f.fieldKey];
                  const typed = typeof values[f.fieldKey] === "string" ? String(values[f.fieldKey]) : "";
                  return (
                    <div key={f.fieldKey} className="text-sm">
                      <p className="text-xs font-semibold text-slate-600">{f.label}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {png ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={png}
                            alt=""
                            className="h-14 max-w-full rounded-lg border border-slate-200 bg-white"
                          />
                        ) : (
                          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                            No signature captured yet.
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setSigModalField(f)}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          {png || typed.trim() ? "Edit signature" : "Click to sign"}
                        </button>
                      </div>
                    </div>
                  );
                }
                if (f.fieldType === "textarea") {
                  return (
                    <label key={f.fieldKey} className="block text-sm text-slate-800">
                      <span className="text-xs font-semibold text-slate-600">{f.label}</span>
                      <textarea
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        rows={3}
                        value={String(values[f.fieldKey] ?? "")}
                        autoComplete="off"
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.fieldKey]: e.target.value }))
                        }
                      />
                    </label>
                  );
                }
                const type = f.fieldType === "date" ? "date" : "text";
                return (
                  <label key={f.fieldKey} className="block text-sm text-slate-800">
                    <span className="text-xs font-semibold text-slate-600">{f.label}</span>
                    <input
                      type={type}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={String(values[f.fieldKey] ?? "")}
                      autoComplete="off"
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.fieldKey]: e.target.value }))
                      }
                    />
                  </label>
                );
              })}

              {data.documentType === "w9" && data.w9CertificationText ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                  <div className="font-semibold">Certification (read carefully)</div>
                  <p className="mt-2 whitespace-pre-wrap">{data.w9CertificationText}</p>
                </section>
              ) : null}

              {err ? <p className="text-sm text-red-700">{err}</p> : null}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={busy}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  Save progress
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Sign & submit
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>

      {sigModalField ? (
        <SignaturePadModal
          field={{
            fieldKey: sigModalField.fieldKey,
            label: sigModalField.label,
            fieldType: sigModalField.fieldType,
          }}
          recipientName={signerNameHint}
          onCancel={() => setSigModalField(null)}
          onApply={(payload) => {
            const f = sigModalField;
            setSigModalField(null);
            if (!f) return;
            if (payload.imageDataUrl) {
              applySignature({
                fieldKey: f.fieldKey,
                typed: payload.typed ?? null,
                imageDataUrl: payload.imageDataUrl,
              });
            }
            if (payload.typed && !payload.imageDataUrl) {
              setValues((v) => ({ ...v, [f.fieldKey]: payload.typed!.trim() }));
            }
          }}
        />
      ) : null}
    </div>
  );
}
