"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { SignaturePadModal } from "@/app/sign/[token]/SignaturePadModal";
import { pdfFieldRectToOverlayCssPx } from "@/lib/pdf-sign/pdf-field-geometry";
import { loadPdfFromUrl, type RenderedPdfPage } from "@/lib/pdf-sign/pdfjs-browser";
import { signerPartyFromField } from "@/lib/pdf-sign/normalize";
import { fieldIsEffectivelyOptional } from "@/lib/pdf-sign/validate-sender-prefill";

import {
  countRequiredComplete,
  firstIncompleteRequiredFieldKey,
  type ProgressField,
} from "./pdf-sign-field-progress";

export type PdfSigningCanvasField = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  signer_role: string | null;
  required: boolean | null;
  options: Record<string, unknown> | null;
  page_index: number;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  font_size: number | null;
  required_order: number;
};

export type PdfSigningCanvasMode = "admin_sender" | "recipient";

type Props = {
  pdfUrl: string;
  fields: PdfSigningCanvasField[];
  mode: PdfSigningCanvasMode;
  senderDisplayName?: string;
  recipientDisplayName?: string;
  textValues: Record<string, string | boolean>;
  onTextChange: (fieldKey: string, v: string | boolean) => void;
  signatureImages: Record<string, string | undefined>;
  onSignatureApply: (fieldKey: string, payload: { imageDataUrl: string | null; typed: string | null }) => void;
  highlightFieldKey?: string | null;
  /** Base width multiplier; 1 = fit container. */
  zoom?: number;
};

function overlayClass(args: {
  party: "sender" | "recipient";
  optional: boolean;
  done: boolean;
  missing: boolean;
  pulse: boolean;
  inactive: boolean;
}): string {
  const base =
    args.party === "sender"
      ? args.optional
        ? "border-2 border-dashed border-amber-400/65 bg-amber-50/20"
        : "border-2 border-amber-500/90 bg-amber-50/30"
      : args.optional
        ? "border-2 border-dashed border-indigo-400/65 bg-indigo-50/20"
        : "border-2 border-indigo-500/90 bg-indigo-50/30";

  let extra = "";
  if (args.inactive) extra += " opacity-70 saturate-75";
  if (args.done) extra += " ring-2 ring-emerald-500/70 border-emerald-600/80 bg-emerald-50/35";
  if (args.missing) extra += " ring-2 ring-rose-500 border-rose-600";
  if (args.pulse) extra += " z-[35] ring-2 ring-amber-500 ring-offset-2 ring-offset-white";
  return `${base}${extra} rounded-md transition-shadow`;
}

export type PdfSigningCanvasHandle = {
  scrollToField: (fieldKey: string) => void;
  goToNextRequired: () => void;
};

export const PdfSigningCanvas = forwardRef<PdfSigningCanvasHandle, Props>(
  function PdfSigningCanvas(
    {
  pdfUrl,
  fields,
  mode,
  senderDisplayName = "",
  recipientDisplayName = "",
  textValues,
  onTextChange,
  signatureImages,
  onSignatureApply,
  highlightFieldKey,
  zoom = 1,
    },
    ref
  ) {
  const viewerMeasureRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const [pdfPages, setPdfPages] = useState<RenderedPdfPage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerInnerWidth, setViewerInnerWidth] = useState(920);
  const [pageDisplaySizes, setPageDisplaySizes] = useState<
    Record<number, { width: number; height: number }>
  >({});

  const [sigFieldKey, setSigFieldKey] = useState<string | null>(null);
  const destroyRef = useRef<(() => Promise<void>) | null>(null);

  const party: "sender" | "recipient" = mode === "admin_sender" ? "sender" : "recipient";

  const progressFields: ProgressField[] = useMemo(
    () =>
      fields.map((f) => ({
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type,
        required: f.required,
        options: f.options,
        signer_role: f.signer_role,
        required_order: f.required_order,
        page_index: f.page_index,
        y: f.y,
      })),
    [fields]
  );

  const { complete, total } = useMemo(
    () =>
      countRequiredComplete({
        fields: progressFields,
        mode,
        textValues,
        signatureImages,
      }),
    [progressFields, mode, textValues, signatureImages]
  );

  const fitWidthCssPx = useMemo(() => {
    const pad = 0;
    const avail = Math.max(0, viewerInnerWidth - pad);
    if (typeof window === "undefined") return Math.max(320, avail);
    const narrow = window.matchMedia("(max-width:639px)").matches;
    /** Mobile: true fit-width; md+: enforce minimum readable width and allow horizontal scroll if needed */
    if (narrow) return Math.max(280, Math.min(avail, 1200));
    return Math.max(720, Math.min(avail, 1400));
  }, [viewerInnerWidth]);

  const displayBaseWidth = Math.min(1600, Math.max(280, fitWidthCssPx * zoom));
  const pageMap = useMemo(() => {
    const m = new Map<number, { width: number; height: number }>();
    if (pdfPages) for (const p of pdfPages) m.set(p.index, { width: p.width, height: p.height });
    return m;
  }, [pdfPages]);

  useEffect(() => {
    const el = viewerMeasureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (typeof w === "number" && w > 0) setViewerInnerWidth(w);
    });
    ro.observe(el);
    setViewerInnerWidth(el.clientWidth || 920);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setPdfPages(null);
    setPageDisplaySizes({});
    (async () => {
      try {
        const { pages, destroy } = await loadPdfFromUrl(pdfUrl);
        destroyRef.current = destroy;
        if (cancelled) {
          await destroy();
          return;
        }
        setPdfPages(pages);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load PDF.");
      }
    })();
    return () => {
      cancelled = true;
      void destroyRef.current?.();
      destroyRef.current = null;
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfPages) return;
    canvasRefs.current = canvasRefs.current.slice(0, pdfPages.length);
    const sizes: Record<number, { width: number; height: number }> = {};
    let cancelled = false;
    (async () => {
      for (let i = 0; i < pdfPages.length; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        try {
          const r = await pdfPages[i].renderToCanvas(canvas, displayBaseWidth);
          if (cancelled) return;
          sizes[i] = { width: r.pixelWidth, height: r.pixelHeight };
        } catch {
          /* noop */
        }
      }
      if (!cancelled) setPageDisplaySizes(sizes);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfPages, displayBaseWidth]);

  const fieldsByPage = useMemo(() => {
    const m = new Map<number, PdfSigningCanvasField[]>();
    for (const f of fields) {
      const pi = typeof f.page_index === "number" ? f.page_index : 0;
      if (!m.has(pi)) m.set(pi, []);
      m.get(pi)!.push(f);
    }
    return m;
  }, [fields]);

  const scrollToFieldInner = useCallback((fieldKey: string) => {
    const f = fields.find((x) => x.field_key === fieldKey);
    if (!f) return;
    const pi = typeof f.page_index === "number" ? f.page_index : 0;
    pageRefs.current[pi]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [fields]);

  const handleNextRequired = useCallback(() => {
    const next = firstIncompleteRequiredFieldKey({
      fields: progressFields,
      mode,
      textValues,
      signatureImages,
    });
    if (next) {
      scrollToFieldInner(next);
      return;
    }
    const first = orderedKeysFirst(progressFields, mode);
    if (first) scrollToFieldInner(first);
  }, [progressFields, mode, textValues, signatureImages, scrollToFieldInner]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToField: scrollToFieldInner,
      goToNextRequired: handleNextRequired,
    }),
    [scrollToFieldInner, handleNextRequired]
  );

  useEffect(() => {
    if (!highlightFieldKey) return;
    scrollToFieldInner(highlightFieldKey);
  }, [highlightFieldKey, scrollToFieldInner]);

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-6 text-sm text-rose-900">
        {loadError}
      </div>
    );
  }

  if (!pdfPages) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-600">
        Loading document…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">
          {complete} of {total} required {mode === "admin_sender" ? "Saintly" : "your"} fields complete
        </span>
        <button
          type="button"
          onClick={handleNextRequired}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          {complete >= total && total > 0 ? "All required complete" : "Next required field"}
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Measure the actual scroll viewport so fit-width matches the readable area */}
        <div
          ref={viewerMeasureRef}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-100 to-slate-50 p-4 pb-32 shadow-inner sm:p-5 sm:pb-32"
        >
          <div className="mx-auto flex w-max min-w-full flex-col items-center gap-10 pb-16 pt-1">
          {pdfPages.map((page) => {
            const i = page.index;
            const box = pageDisplaySizes[i];
            const fieldsHere = fieldsByPage.get(i) ?? [];
            const pdfSize = pageMap.get(i);
            const sortedHere =
              box && pdfSize
                ? [...fieldsHere].sort((a, b) => {
                    const rank = (f: (typeof fields)[number]) =>
                      signerPartyFromField(f) === "recipient" ? 0 : 1;
                    return rank(a) - rank(b);
                  })
                : [];
            return (
              <div
                key={i}
                ref={(el) => {
                  pageRefs.current[i] = el;
                }}
                className="relative inline-block max-w-full overflow-visible rounded-lg bg-white shadow-lg ring-1 ring-slate-300/50"
                style={{ width: box?.width || displayBaseWidth }}
                data-pdf-page-index={i}
              >
                <div className="absolute left-3 top-3 z-30 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
                  Page {i + 1}
                </div>
                <div className="relative">
                  <canvas
                    className="pointer-events-none block h-auto max-w-full"
                    ref={(el) => {
                      canvasRefs.current[i] = el;
                    }}
                  />
                  {box && pdfSize ? (
                    <div className="pointer-events-none absolute inset-0 z-[5]">
                      {sortedHere.map((f) => {
                        if (
                          f.x == null ||
                          f.y == null ||
                          f.width == null ||
                          f.height == null ||
                          f.width <= 0 ||
                          f.height <= 0
                        )
                          return null;
                        const fieldParty = signerPartyFromField(f);
                        const editableHere =
                          (mode === "admin_sender" && fieldParty === "sender") ||
                          (mode === "recipient" && fieldParty === "recipient");
                        const readOnlyForeign =
                          (mode === "admin_sender" && fieldParty === "recipient") ||
                          (mode === "recipient" && fieldParty === "sender");

                        const rect = pdfFieldRectToOverlayCssPx({
                          pdfPageWidthPt: pdfSize.width,
                          pdfPageHeightPt: pdfSize.height,
                          x: f.x,
                          y: f.y,
                          width: f.width,
                          height: f.height,
                          displayPageWidthPx: box.width,
                        });
                        const optional = fieldIsEffectivelyOptional(f);
                        const pulse = highlightFieldKey === f.field_key;
                        const tv = textValues[f.field_key];
                        const sigImg = signatureImages[f.field_key];
                        const valueComplete = editableHere && fieldValueSatisfied(f, tv, sigImg);
                        const missing =
                          editableHere && !optional && !fieldValueSatisfied(f, tv, sigImg);

                        const oc = overlayClass({
                          party: fieldParty === "sender" ? "sender" : "recipient",
                          optional,
                          done: valueComplete,
                          missing,
                          pulse,
                          inactive: readOnlyForeign,
                        });

                        const pe = readOnlyForeign
                          ? "pointer-events-none z-[6]"
                          : "pointer-events-auto z-20";

                        return (
                          <div
                            key={f.id}
                            className={`absolute box-border ${pe} ${oc}`}
                            style={{
                              left: rect.left,
                              top: rect.top,
                              width: Math.max(rect.width, 28),
                              height: Math.max(rect.height, 22),
                              fontSize: Math.min(Math.max(f.font_size ?? 11, 9), 18),
                            }}
                          >
                            <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-between gap-1 px-0.5 text-[9px] font-semibold leading-tight">
                              <span className="truncate text-slate-800">
                                {fieldParty === "sender" ? "Saintly" : "Signer"}
                                {optional ? " · Optional" : ""}
                              </span>
                              {valueComplete ? (
                                <span className="shrink-0 text-emerald-700">✓</span>
                              ) : null}
                            </div>
                            {readOnlyForeign ? (
                              <div className="pointer-events-none mt-3 px-0.5 text-[10px] font-medium leading-snug text-slate-700">
                                {mode === "admin_sender"
                                  ? "Recipient completes after send"
                                  : "Completed in document"}
                              </div>
                            ) : editableHere ? (
                              <div className="mt-3 h-[calc(100%-12px)] w-full px-0.5 [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_label]:pointer-events-auto [&_textarea]:pointer-events-auto">
                                <FieldEditor
                                  f={f}
                                  textValue={tv}
                                  sigImg={sigImg}
                                  onTextChange={onTextChange}
                                  onOpenSignature={() => setSigFieldKey(f.field_key)}
                                />
                              </div>
                            ) : (
                              <div className="pointer-events-none mt-3 text-[10px] text-slate-500">
                                —
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {sigFieldKey ? (
        <SignaturePadModal
          field={(() => {
            const f = fields.find((x) => x.field_key === sigFieldKey);
            return {
              fieldKey: sigFieldKey,
              label: f?.label || sigFieldKey,
              fieldType: f?.field_type || "signature",
            };
          })()}
          recipientName={mode === "admin_sender" ? senderDisplayName : recipientDisplayName}
          onCancel={() => setSigFieldKey(null)}
          onApply={(payload) => {
            const k = sigFieldKey;
            setSigFieldKey(null);
            if (k) onSignatureApply(k, payload);
          }}
        />
      ) : null}
    </div>
  );
});

PdfSigningCanvas.displayName = "PdfSigningCanvas";

function orderedKeysFirst(progress: ProgressField[], mode: PdfSigningCanvasMode) {
  const ordered = [...progress].sort((a, b) => {
    if (a.required_order !== b.required_order) return a.required_order - b.required_order;
    if (a.page_index !== b.page_index) return a.page_index - b.page_index;
    return (b.y ?? 0) - (a.y ?? 0);
  });
  const want = mode === "admin_sender" ? "sender" : "recipient";
  for (const f of ordered) {
    if (signerPartyFromField(f) === want && !fieldIsEffectivelyOptional(f)) return f.field_key;
  }
  return null;
}

function fieldValueSatisfied(
  f: PdfSigningCanvasField,
  textVal: string | boolean | undefined,
  sigImg: string | undefined
): boolean {
  if (fieldIsEffectivelyOptional(f)) return true;
  if (f.field_type === "checkbox") {
    return textVal === true || textVal === "true" || textVal === "yes";
  }
  if (f.field_type === "signature" || f.field_type === "initials") {
    const typed = textVal != null && String(textVal).trim() !== "";
    return Boolean(sigImg || typed);
  }
  return textVal != null && String(textVal).trim() !== "";
}

function FieldEditor({
  f,
  textValue,
  sigImg,
  onTextChange,
  onOpenSignature,
}: {
  f: PdfSigningCanvasField;
  textValue: string | boolean | undefined;
  sigImg: string | undefined;
  onTextChange: (k: string, v: string | boolean) => void;
  onOpenSignature: () => void;
}) {
  const fk = f.field_key;
  const ft = String(f.field_type ?? "").toLowerCase();

  if (ft === "checkbox") {
    return (
      <label className="pointer-events-auto flex h-full cursor-pointer items-center justify-center gap-1">
        <input
          type="checkbox"
          className="pointer-events-auto h-4 w-4 rounded border-slate-400 text-amber-600"
          checked={Boolean(textValue === true || textValue === "true")}
          onChange={(e) => onTextChange(fk, e.target.checked)}
        />
      </label>
    );
  }

  if (ft === "signature" || ft === "initials") {
    return (
      <button
        type="button"
        onClick={onOpenSignature}
        className="pointer-events-auto flex h-full w-full items-center justify-center overflow-hidden rounded bg-white/80 shadow-sm hover:bg-white"
      >
        {sigImg ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={sigImg} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="px-1 text-[10px] font-semibold text-slate-700">Click to sign</span>
        )}
      </button>
    );
  }

  if (ft === "textarea") {
    return (
      <textarea
        className="pointer-events-auto h-full w-full resize-none rounded border-0 bg-white/90 px-1 py-0.5 text-inherit leading-tight text-slate-900 shadow-none outline-none ring-0 focus:bg-white"
        value={String(textValue ?? "")}
        onChange={(e) => onTextChange(fk, e.target.value)}
      />
    );
  }

  if (ft === "number") {
    return (
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="pointer-events-auto h-full w-full rounded border-0 bg-white/90 px-1 py-0.5 text-inherit leading-tight text-slate-900 outline-none focus:bg-white"
        value={String(textValue ?? "")}
        onChange={(e) => onTextChange(fk, e.target.value)}
      />
    );
  }

  const inputType = ft === "date" ? "date" : "text";
  return (
    <input
      type={inputType}
      autoComplete="off"
      className="pointer-events-auto h-full w-full rounded border-0 bg-white/90 px-1 py-0.5 text-inherit leading-tight text-slate-900 outline-none focus:bg-white"
      value={String(textValue ?? "")}
      onChange={(e) => onTextChange(fk, e.target.value)}
    />
  );
}
