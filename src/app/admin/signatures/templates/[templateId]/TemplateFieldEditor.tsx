"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { loadPdfFromUrl, type RenderedPdfPage } from "@/lib/pdf-sign/pdfjs-browser";

type PdfSignFieldType = "text" | "textarea" | "date" | "checkbox" | "signature" | "tin" | "select";

/** Stored under `options.signer_role`. */
type TemplateSignerRole = "recipient" | "employee" | "contractor" | "company" | "admin";

type PdfSignAutofillSource =
  | "none"
  | "recipient_name"
  | "recipient_email"
  | "recipient_phone"
  | "today_date"
  | "sender_name"
  | "company_name";

type EditorField = {
  id: string;
  field_key: string;
  label: string;
  field_type: PdfSignFieldType;
  validation_kind: string | null;
  autofill_source: PdfSignAutofillSource;
  signer_role: TemplateSignerRole;
  required: boolean;
  page_index: number;
  page_width: number;
  page_height: number;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  pdf_acroform_field_name: string | null;
  prefill_value: string | null;
  required_order: number;
  is_suggestion: boolean;
  hint?: string;
  autofit_text: boolean;
  signer_editable: boolean;
};

type LoadedTemplate = {
  template: {
    id: string;
    name: string;
    document_type: string;
    description: string | null;
    is_active: boolean;
  };
  fields: Array<{
    id: string;
    field_key: string;
    label: string;
    field_type: string;
    signer_role: string | null;
    required: boolean | null;
    required_order: number;
    page_index: number;
    page_width: number | null;
    page_height: number | null;
    x: number | null;
    y: number | null;
    width: number | null;
    height: number | null;
    font_size: number;
    pdf_acroform_field_name: string | null;
    prefill_value: string | null;
    options: Record<string, unknown> | null;
  }>;
  pdfUrl: string | null;
};

type FieldPreset =
  | "text"
  | "textarea"
  | "date"
  | "checkbox"
  | "signature"
  | "number_only"
  | "select"
  | "tin";

type PresetSpec = {
  label: string;
  keyBase: string;
  fieldType: PdfSignFieldType;
  validationKind: string | null;
  width: number;
  height: number;
  fontSize: number;
};

const FIELD_PRESETS: Record<FieldPreset, PresetSpec> = {
  text: {
    label: "Text field",
    keyBase: "text_field",
    fieldType: "text",
    validationKind: null,
    width: 220,
    height: 24,
    fontSize: 11,
  },
  textarea: {
    label: "Text field",
    keyBase: "text_field",
    fieldType: "textarea",
    validationKind: null,
    width: 280,
    height: 60,
    fontSize: 11,
  },
  date: {
    label: "Date",
    keyBase: "date_field",
    fieldType: "date",
    validationKind: null,
    width: 120,
    height: 22,
    fontSize: 11,
  },
  checkbox: {
    label: "Checkbox",
    keyBase: "checkbox_field",
    fieldType: "checkbox",
    validationKind: null,
    width: 18,
    height: 18,
    fontSize: 11,
  },
  signature: {
    label: "Signature",
    keyBase: "signature_field",
    fieldType: "signature",
    validationKind: null,
    width: 220,
    height: 50,
    fontSize: 16,
  },
  number_only: {
    label: "Number only",
    keyBase: "number_field",
    fieldType: "text",
    validationKind: "number_only",
    width: 160,
    height: 22,
    fontSize: 11,
  },
  select: {
    label: "Select",
    keyBase: "select_field",
    fieldType: "select",
    validationKind: null,
    width: 180,
    height: 24,
    fontSize: 11,
  },
  tin: {
    label: "TIN",
    keyBase: "tin_field",
    fieldType: "tin",
    validationKind: null,
    width: 160,
    height: 22,
    fontSize: 11,
  },
};

const PRESET_ORDER: FieldPreset[] = [
  "text",
  "textarea",
  "date",
  "checkbox",
  "signature",
  "number_only",
  "select",
  "tin",
];

const PDF_SIGN_DOCUMENT_TYPE_SUGGESTIONS: { value: string; label: string }[] = [
  { value: "generic_contract", label: "Generic contract" },
  { value: "w9", label: "IRS Form W-9" },
  { value: "i9", label: "Form I-9" },
];

const ASSIGNED_TO_OPTIONS: { value: TemplateSignerRole; label: string }[] = [
  { value: "recipient", label: "Recipient (signer)" },
  { value: "employee", label: "Employee" },
  { value: "contractor", label: "Contractor" },
  { value: "company", label: "Company" },
  { value: "admin", label: "Admin / prefilled" },
];

const AUTOFILL_OPTIONS: { value: PdfSignAutofillSource; label: string }[] = [
  { value: "none", label: "No auto-fill" },
  { value: "recipient_name", label: "Recipient name" },
  { value: "recipient_email", label: "Recipient email" },
  { value: "recipient_phone", label: "Recipient phone" },
  { value: "today_date", label: "Today’s date" },
  { value: "sender_name", label: "Sender / staff name" },
  { value: "company_name", label: "Company name" },
];

const DEFAULT_LABELS = new Set(Object.values(FIELD_PRESETS).map((v) => v.label));
const DEFAULT_KEY_BASES = new Set(Object.values(FIELD_PRESETS).map((v) => v.keyBase));

function isDefaultLabel(label: string): boolean {
  return DEFAULT_LABELS.has(label.trim());
}

function isDefaultKey(key: string): boolean {
  const base = key.replace(/_\d+$/, "");
  return DEFAULT_KEY_BASES.has(base);
}

function presetForField(f: EditorField): FieldPreset {
  if (f.validation_kind === "number_only") return "number_only";
  if (f.field_type === "tin") return "tin";
  if (f.field_type === "text") return "text";
  return f.field_type as FieldPreset;
}

function presetLabel(p: FieldPreset): string {
  return FIELD_PRESETS[p].label;
}

function presetShortLabel(p: FieldPreset): string {
  switch (p) {
    case "text":
    case "textarea":
      return "TEXT";
    case "date":
      return "DATE";
    case "checkbox":
      return "CHECK";
    case "signature":
      return "SIG";
    case "number_only":
      return "NUM";
    case "select":
      return "SEL";
    case "tin":
      return "TIN";
  }
}

function rolePill(role: TemplateSignerRole): string {
  switch (role) {
    case "recipient":
      return "SIGNER";
    case "employee":
      return "EMPL";
    case "contractor":
      return "CTR";
    case "company":
      return "CO";
    case "admin":
      return "ADM";
  }
}

function overlayClasses(isSuggestion: boolean, isSelected: boolean): string {
  const ring = isSelected ? "ring-2 ring-indigo-400 " : "";
  if (isSuggestion) {
    return `${ring}border-2 border-dashed border-amber-500 bg-amber-50/50 text-amber-950`;
  }
  return `${ring}border-2 border-emerald-500 bg-emerald-50/40 text-emerald-950`;
}

function genId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(0, 12)}`;
}

function uniqueKey(base: string, used: Set<string>): string {
  const safe =
    base.replace(/[^a-z0-9_]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "field";
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  let i = 2;
  while (used.has(`${safe}_${i}`)) i++;
  used.add(`${safe}_${i}`);
  return `${safe}_${i}`;
}

function normalizeSignerRole(v: string | null | undefined): TemplateSignerRole {
  const x = (v || "").toLowerCase();
  if (x === "employee") return "employee";
  if (x === "contractor") return "contractor";
  if (x === "company") return "company";
  if (x === "admin") return "admin";
  return "recipient";
}

function suggestAutofill(params: {
  label: string;
  fieldKey: string;
  fieldType: PdfSignFieldType;
  role: TemplateSignerRole;
}): PdfSignAutofillSource {
  const { label, fieldKey, fieldType, role } = params;
  const L = `${label} ${fieldKey}`.toLowerCase();
  if (fieldType === "date") return "today_date";
  if (fieldType === "tin") return "none";
  if (fieldType === "signature" || fieldType === "checkbox") return "none";
  if (L.includes("company") || L.includes("business")) return "company_name";
  if (L.includes("email")) return role === "recipient" ? "recipient_email" : "none";
  if (L.includes("phone") || L.includes("mobile")) return "recipient_phone";
  if (L.includes("name") || L.includes("print")) {
    return role === "recipient" || role === "employee" ? "recipient_name" : "sender_name";
  }
  return "none";
}

export function TemplateFieldEditor({ templateId }: { templateId: string }) {
  const [loaded, setLoaded] = useState<LoadedTemplate | null>(null);
  const [pdfPages, setPdfPages] = useState<RenderedPdfPage[] | null>(null);
  const [fields, setFields] = useState<EditorField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("[]");
  const [name, setName] = useState("");
  const [docType, setDocType] = useState("");
  const [description, setDescription] = useState("");
  const [pageDisplayWidth, setPageDisplayWidth] = useState(720);
  const [selectedAddPreset, setSelectedAddPreset] = useState<FieldPreset | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const router = useRouter();

  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageDisplaySizes, setPageDisplaySizes] = useState<Record<number, { width: number; height: number }>>({});

  const dragStateRef = useRef<{
    fieldId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    mode: "move" | "resize";
    pageIndex: number;
    moved: boolean;
  } | null>(null);
  const suppressPdfClickRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!cancelled) setSaveError(j.error || "Could not load template.");
        return;
      }
      const j = (await res.json()) as LoadedTemplate;
      if (cancelled) return;
      setLoaded(j);
      setName(j.template.name);
      setDocType(j.template.document_type);
      setDescription(j.template.description || "");
      setFields(j.fields.map(mapStoredToEditor));
      setIsDirty(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    if (!loaded?.pdfUrl) return;
    let cancelled = false;
    let destroyer: (() => Promise<void>) | null = null;
    (async () => {
      try {
        const { pages, destroy } = await loadPdfFromUrl(loaded.pdfUrl as string);
        destroyer = destroy;
        if (cancelled) {
          await destroy();
          return;
        }
        setPdfPages(pages);
      } catch (e) {
        if (!cancelled) {
          setSaveError(e instanceof Error ? e.message : "Could not render PDF.");
        }
      }
    })();
    return () => {
      cancelled = true;
      void destroyer?.();
    };
  }, [loaded?.pdfUrl]);

  useEffect(() => {
    if (!pdfPages) return;
    canvasRefs.current = canvasRefs.current.slice(0, pdfPages.length);
    const sizes: Record<number, { width: number; height: number }> = {};
    (async () => {
      for (let i = 0; i < pdfPages.length; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        try {
          const r = await pdfPages[i].renderToCanvas(canvas, pageDisplayWidth);
          sizes[i] = { width: r.pixelWidth, height: r.pixelHeight };
        } catch {
          /* skip */
        }
      }
      setPageDisplaySizes(sizes);
    })();
  }, [pdfPages, pageDisplayWidth]);

  const pageMap = useMemo(() => {
    const map = new Map<number, { width: number; height: number }>();
    if (pdfPages) {
      for (const p of pdfPages) map.set(p.index, { width: p.width, height: p.height });
    }
    return map;
  }, [pdfPages]);

  const usedKeys = useMemo(() => new Set(fields.map((f) => f.field_key)), [fields]);

  const pdfToScreen = useCallback(
    (pageIndex: number, x: number, y: number, width: number, height: number) => {
      const display = pageDisplaySizes[pageIndex];
      const pdfSize = pageMap.get(pageIndex);
      if (!display || !pdfSize) return null;
      const scale = display.width / pdfSize.width;
      return {
        left: x * scale,
        top: (pdfSize.height - (y + height)) * scale,
        width: width * scale,
        height: height * scale,
      };
    },
    [pageDisplaySizes, pageMap]
  );

  const screenToPdf = useCallback(
    (pageIndex: number, leftPx: number, topPx: number, widthPx: number, heightPx: number) => {
      const display = pageDisplaySizes[pageIndex];
      const pdfSize = pageMap.get(pageIndex);
      if (!display || !pdfSize) return null;
      const scale = display.width / pdfSize.width;
      const x = leftPx / scale;
      const widthPdf = widthPx / scale;
      const heightPdf = heightPx / scale;
      const yPdf = pdfSize.height - topPx / scale - heightPdf;
      return { x, y: yPdf, width: widthPdf, height: heightPdf };
    },
    [pageDisplaySizes, pageMap]
  );

  const updateField = useCallback((id: string, partial: Partial<EditorField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...partial } : f)));
    setIsDirty(true);
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setIsDirty(true);
  }, []);

  useEffect(() => {
    function isFormFieldTarget(t: EventTarget | null): boolean {
      if (!t || !(t instanceof HTMLElement)) return false;
      if (t.isContentEditable) return true;
      return Boolean(
        t.closest("input, textarea, select, button, [contenteditable='true']")
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isFormFieldTarget(e.target)) return;
      if (!selectedId) return;
      e.preventDefault();
      removeField(selectedId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, removeField]);

  function addFieldAtPoint(pageIndex: number, leftPx: number, topPx: number, preset: FieldPreset) {
    const display = pageDisplaySizes[pageIndex];
    const pdfSize = pageMap.get(pageIndex);
    if (!display || !pdfSize) return;
    const spec = FIELD_PRESETS[preset];
    const scale = display.width / pdfSize.width;
    const widthPx = spec.width * scale;
    const heightPx = spec.height * scale;
    const pdfRect = screenToPdf(pageIndex, leftPx, topPx, widthPx, heightPx);
    if (!pdfRect) return;
    const used = new Set(usedKeys);
    const role: TemplateSignerRole = "recipient";
    const newField: EditorField = {
      id: genId(),
      field_key: uniqueKey(spec.keyBase, used),
      label: spec.label,
      field_type: spec.fieldType,
      validation_kind: spec.validationKind,
      autofill_source: suggestAutofill({
        label: spec.label,
        fieldKey: spec.keyBase,
        fieldType: spec.fieldType,
        role,
      }),
      signer_role: role,
      required: spec.fieldType !== "checkbox",
      page_index: pageIndex,
      page_width: pdfSize.width,
      page_height: pdfSize.height,
      x: pdfRect.x,
      y: pdfRect.y,
      width: pdfRect.width,
      height: pdfRect.height,
      font_size: spec.fontSize,
      pdf_acroform_field_name: null,
      prefill_value: null,
      required_order: fields.length,
      is_suggestion: false,
      autofit_text: true,
      signer_editable: true,
    };
    setFields((p) => [...p, newField]);
    setSelectedId(newField.id);
    setIsDirty(true);
  }

  function changeFieldPreset(id: string, newPreset: FieldPreset) {
    const spec = FIELD_PRESETS[newPreset];
    setFields((prev) => {
      const target = prev.find((f) => f.id === id);
      if (!target) return prev;
      const usedExceptThis = new Set(prev.filter((f) => f.id !== id).map((f) => f.field_key));
      const update: Partial<EditorField> = {
        field_type: spec.fieldType,
        validation_kind: spec.validationKind,
        font_size: spec.fontSize,
      };
      if (isDefaultLabel(target.label)) update.label = spec.label;
      if (isDefaultKey(target.field_key)) update.field_key = uniqueKey(spec.keyBase, usedExceptThis);
      const nextLabel = update.label ?? target.label;
      const nextKey = update.field_key ?? target.field_key;
      update.autofill_source = suggestAutofill({
        label: nextLabel,
        fieldKey: nextKey,
        fieldType: spec.fieldType,
        role: target.signer_role,
      });
      return prev.map((f) => (f.id === id ? { ...f, ...update } : f));
    });
    setIsDirty(true);
  }

  function changeFieldAssignedTo(id: string, role: TemplateSignerRole) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, signer_role: role };
        next.autofill_source = suggestAutofill({
          label: f.label,
          fieldKey: f.field_key,
          fieldType: f.field_type,
          role,
        });
        return next;
      })
    );
    setIsDirty(true);
  }

  const onPointerMove = useCallback(
    (e: globalThis.MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const display = pageDisplaySizes[state.pageIndex];
      const pdfSize = pageMap.get(state.pageIndex);
      if (!display || !pdfSize) return;
      const scale = display.width / pdfSize.width;
      const dx = (e.clientX - state.startX) / scale;
      const dy = (e.clientY - state.startY) / scale;
      state.moved = true;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== state.fieldId) return f;
          if (state.mode === "move") {
            const nx = clamp(state.origX + dx, 0, pdfSize.width - f.width);
            const ny = clamp(state.origY - dy, 0, pdfSize.height - f.height);
            return { ...f, x: nx, y: ny };
          }
          const nw = clamp(state.origW + dx, 16, pdfSize.width - f.x);
          const nh = clamp(state.origH + dy, 12, pdfSize.height - f.y);
          const ny = clamp(state.origY - (nh - state.origH), 0, pdfSize.height - nh);
          return { ...f, width: nw, height: nh, y: ny };
        })
      );
    },
    [pageDisplaySizes, pageMap]
  );

  const onPointerUp = useCallback(() => {
    const moved = dragStateRef.current?.moved === true;
    dragStateRef.current = null;
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
    if (moved) {
      setIsDirty(true);
      suppressPdfClickRef.current = true;
      window.setTimeout(() => {
        suppressPdfClickRef.current = false;
      }, 100);
    }
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (
      e: ReactMouseEvent<HTMLDivElement>,
      field: EditorField,
      mode: "move" | "resize"
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const display = pageDisplaySizes[field.page_index];
      const pdfSize = pageMap.get(field.page_index);
      if (!display || !pdfSize) return;
      dragStateRef.current = {
        fieldId: field.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: field.x,
        origY: field.y,
        origW: field.width,
        origH: field.height,
        mode,
        pageIndex: field.page_index,
        moved: false,
      };
      setSelectedId(field.id);
      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
    },
    [pageDisplaySizes, pageMap, onPointerMove, onPointerUp]
  );

  async function scanPdf() {
    setScanBusy(true);
    setScanResult(null);
    try {
      const res = await fetch(
        `/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}/scan`,
        { method: "POST" }
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setScanResult(j.error || "Scan failed.");
        return;
      }
      const j = (await res.json()) as { suggestions?: unknown[] };
      const n = Array.isArray(j.suggestions) ? j.suggestions.length : 0;
      if (n === 0) {
        setScanResult(
          "No automatic suggestions yet. Click the PDF to add fields manually, or try again later."
        );
      } else {
        setScanResult(`Suggested ${n} field(s).`);
      }
    } finally {
      setScanBusy(false);
    }
  }

  function acceptAllSuggestions() {
    setFields((prev) => prev.map((f, i) => ({ ...f, is_suggestion: false, required_order: i })));
    setIsDirty(true);
  }

  function deleteAllSuggestions() {
    setFields((prev) => prev.filter((f) => !f.is_suggestion));
    setIsDirty(true);
  }

  async function save() {
    setSaveBusy(true);
    setSaveError(null);
    try {
      const seenKeys = new Set<string>();
      for (const f of fields) {
        if (!f.field_key.trim()) {
          setSaveError(`Field "${f.label || f.id}" has no key.`);
          return;
        }
        if (seenKeys.has(f.field_key)) {
          setSaveError(`Duplicate field key: ${f.field_key}.`);
          return;
        }
        seenKeys.add(f.field_key);
      }

      const payloadFields = fields.map((f, i) => ({
        id: f.id,
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type,
        required: f.required,
        required_order: i,
        page_index: f.page_index,
        page_width: f.page_width,
        page_height: f.page_height,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        font_size: f.font_size,
        pdf_acroform_field_name: f.pdf_acroform_field_name,
        prefill_value: f.prefill_value,
        options: {
          ...(f.validation_kind ? { validation_kind: f.validation_kind } : {}),
          ...(f.autofill_source && f.autofill_source !== "none"
            ? { autofill_source: f.autofill_source }
            : {}),
          signer_role: f.signer_role,
          autofit_text: f.autofit_text,
          signer_editable: f.signer_editable,
        },
      }));

      const res = await fetch(`/api/pdf-sign/admin/templates/${encodeURIComponent(templateId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          document_type: docType,
          description,
          fields: payloadFields,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setSaveError(j.error || "Save failed.");
        return;
      }
      setFields((prev) => prev.map((f) => ({ ...f, is_suggestion: false })));
      setSaveError(null);
      setIsDirty(false);
      setSavedToast("Template fields saved.");
      router.refresh();
      window.setTimeout(() => setSavedToast(null), 4000);
    } finally {
      setSaveBusy(false);
    }
  }

  useEffect(() => {
    setJsonText(JSON.stringify(toAdvancedJson(fields), null, 2));
  }, [fields]);

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error("Expected an array.");
      const next: EditorField[] = parsed.map((row, i) => {
        const r = row as Record<string, unknown>;
        const ft = (r.field_type as PdfSignFieldType) || "text";
        const pageIndex = typeof r.page_index === "number" ? r.page_index : 0;
        const pdfSize = pageMap.get(pageIndex);
        const presetKey: FieldPreset = ft === "tin" ? "tin" : (ft as FieldPreset);
        const spec = FIELD_PRESETS[presetKey] ?? FIELD_PRESETS.text;
        const optionsRaw =
          (r.options as {
            validation_kind?: string;
            autofill_source?: string;
            autofit_text?: boolean;
            signer_editable?: boolean;
            signer_role?: string;
          } | undefined) || {};
        const role = normalizeSignerRole(optionsRaw.signer_role);
        return {
          id: genId(),
          field_key: String(r.field_key || `field_${i}`),
          label: String(r.label || "Untitled"),
          field_type: ft,
          validation_kind:
            typeof optionsRaw.validation_kind === "string" && optionsRaw.validation_kind
              ? optionsRaw.validation_kind
              : null,
          autofill_source:
            (typeof optionsRaw.autofill_source === "string"
              ? (optionsRaw.autofill_source as PdfSignAutofillSource)
              : null) ?? "none",
          signer_role: role,
          required: r.required !== false,
          required_order: typeof r.required_order === "number" ? r.required_order : i,
          page_index: pageIndex,
          page_width: typeof r.page_width === "number" ? r.page_width : pdfSize?.width ?? 612,
          page_height: typeof r.page_height === "number" ? r.page_height : pdfSize?.height ?? 792,
          x: typeof r.x === "number" ? r.x : 50,
          y: typeof r.y === "number" ? r.y : 50,
          width: typeof r.width === "number" ? r.width : spec.width,
          height: typeof r.height === "number" ? r.height : spec.height,
          font_size: typeof r.font_size === "number" ? r.font_size : spec.fontSize,
          pdf_acroform_field_name:
            typeof r.pdf_acroform_field_name === "string" ? r.pdf_acroform_field_name : null,
          prefill_value: typeof r.prefill_value === "string" ? r.prefill_value : null,
          is_suggestion: false,
          autofit_text: optionsRaw.autofit_text !== false,
          signer_editable: optionsRaw.signer_editable !== false,
        };
      });
      setFields(next);
      setSaveError("Applied JSON. Click Save template fields to persist.");
      setIsDirty(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Invalid JSON.");
    }
  }

  if (!loaded) {
    return <p className="mt-8 text-sm text-slate-600">Loading template…</p>;
  }
  if (!loaded.pdfUrl) {
    return (
      <p className="mt-8 text-sm text-rose-700">
        Template PDF could not be loaded. Try re-uploading the template.
      </p>
    );
  }

  const selected = fields.find((f) => f.id === selectedId) || null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div ref={containerRef} className="min-w-0 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              disabled={scanBusy}
              onClick={() => void scanPdf()}
              className="rounded-full bg-slate-900 px-4 py-1.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {scanBusy ? "Scanning…" : "Scan PDF and suggest fields"}
            </button>
            {fields.some((f) => f.is_suggestion) ? (
              <>
                <button
                  type="button"
                  onClick={acceptAllSuggestions}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Accept all suggestions
                </button>
                <button
                  type="button"
                  onClick={deleteAllSuggestions}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Delete suggestions
                </button>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-slate-600">
              Page width
              <input
                type="range"
                min={480}
                max={1100}
                step={20}
                value={pageDisplayWidth}
                onChange={(e) => setPageDisplayWidth(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saveBusy}
              className="rounded-full bg-indigo-600 px-4 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saveBusy ? "Saving…" : "Save template fields"}
            </button>
            <Link
              href="/admin/signatures/templates"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-50"
            >
              Done
            </Link>
          </div>
        </div>

        {scanResult ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
            {scanResult}
          </div>
        ) : null}
        {isDirty ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900">
            You have unsaved field changes. Click <strong>Save template fields</strong> before
            sending this template.
          </div>
        ) : null}
        {savedToast ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs font-semibold text-emerald-900">
            ✓ {savedToast}
          </div>
        ) : null}
        {saveError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900">
            {saveError}
          </div>
        ) : null}

        {pdfPages?.map((page) => (
          <div
            key={page.index}
            className="relative inline-block self-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            style={{ width: pageDisplaySizes[page.index]?.width || pageDisplayWidth }}
          >
            <div className="absolute left-2 top-2 z-10 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-white">
              Page {page.index + 1}
            </div>
            <div
              className="relative cursor-crosshair"
              onClick={(e) => {
                if (suppressPdfClickRef.current) return;
                if (dragStateRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const leftPx = e.clientX - rect.left;
                const topPx = e.clientY - rect.top;
                addFieldAtPoint(page.index, leftPx, topPx, selectedAddPreset ?? "signature");
              }}
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[page.index] = el;
                }}
              />
              {fields
                .filter((f) => f.page_index === page.index)
                .map((field) => {
                  const screen = pdfToScreen(field.page_index, field.x, field.y, field.width, field.height);
                  if (!screen) return null;
                  const isSelected = selectedId === field.id;
                  const preset = presetForField(field);
                  const style: CSSProperties = {
                    position: "absolute",
                    left: screen.left,
                    top: screen.top,
                    width: screen.width,
                    height: screen.height,
                  };
                  return (
                    <div
                      key={field.id}
                      data-field-id={field.id}
                      style={style}
                      onMouseDown={(e) => onPointerDown(e, field, "move")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(field.id);
                      }}
                      className={
                        "group cursor-move select-none rounded-md border-2 text-[10px] font-semibold transition " +
                        overlayClasses(field.is_suggestion, isSelected)
                      }
                    >
                      <div className="flex items-center justify-between gap-1 px-1.5 py-0.5">
                        <span className="flex min-w-0 items-center gap-1 truncate">
                          {field.is_suggestion ? (
                            <span className="rounded bg-amber-200/90 px-1 text-[9px] font-bold uppercase text-amber-900">
                              Suggested
                            </span>
                          ) : null}
                          <span className="rounded bg-white/80 px-1 text-[8px] font-bold uppercase text-slate-800">
                            {rolePill(field.signer_role)}
                          </span>
                          <span className="font-bold uppercase opacity-90">
                            {presetShortLabel(preset)}
                          </span>
                          <span className="truncate font-medium normal-case">{field.label}</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeField(field.id);
                          }}
                          className="rounded text-slate-700 opacity-60 hover:opacity-100"
                          aria-label="Delete field"
                        >
                          ×
                        </button>
                      </div>
                      <div
                        role="presentation"
                        title="Resize from corner"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onPointerDown(e, field, "resize");
                        }}
                        className="absolute bottom-0.5 right-0.5 z-10 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-0.5"
                      >
                        <span className="pointer-events-none inline-block h-3.5 w-3.5 rounded-sm border-2 border-emerald-600 bg-white shadow ring-1 ring-emerald-300" />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}

        {!pdfPages ? <p className="text-sm text-slate-500">Loading PDF preview…</p> : null}
      </div>

      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Field Settings</h3>
          {selected ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                Edit the selected field. Changes apply in the editor; save when you are done.
              </p>
              <FieldDetail
                field={selected}
                onChange={(p) => updateField(selected.id, p)}
                onChangePreset={(np) => changeFieldPreset(selected.id, np)}
                onChangeAssignedTo={(a) => changeFieldAssignedTo(selected.id, a)}
                onDelete={() => removeField(selected.id)}
              />
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Select a field to edit its settings.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Template details</h3>
          <label className="mt-3 block text-xs text-slate-600">
            Template name
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setIsDirty(true);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs text-slate-600">
            Document type
            <select
              value={
                PDF_SIGN_DOCUMENT_TYPE_SUGGESTIONS.find((o) => o.value === docType)
                  ? docType
                  : "generic_contract"
              }
              onChange={(e) => {
                setDocType(e.target.value);
                setIsDirty(true);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {PDF_SIGN_DOCUMENT_TYPE_SUGGESTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs text-slate-600">
            Description (optional)
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setIsDirty(true);
              }}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Add field</h3>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Click PDF to drop
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Choose a field type, then click on the PDF to place it.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs">
            {PRESET_ORDER.map((p) => {
              const isActive = selectedAddPreset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setSelectedAddPreset(p);
                    if (!pdfPages || !pdfPages[0]) return;
                    const display = pageDisplaySizes[0];
                    if (!display) return;
                    addFieldAtPoint(0, display.width / 2 - 60, display.height / 2 - 16, p);
                  }}
                  className={
                    "rounded-lg border px-2 py-1.5 font-semibold transition " +
                    (isActive
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  + {presetLabel(p)}
                </button>
              );
            })}
          </div>
        </div>

        <FieldsOnTemplate
          fields={fields}
          selectedId={selectedId}
          onPick={(id) => {
            setSelectedId(id);
            requestAnimationFrame(() => {
              const el = containerRef.current?.querySelector<HTMLElement>(
                `[data-field-id="${id}"]`
              );
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
          }}
        />

        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            Developer field JSON
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            For troubleshooting. Use Apply to replace the in-memory field list, then save.
          </p>
          <div className="mt-3 space-y-2">
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={12}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[11px]"
            />
            <button
              type="button"
              onClick={applyJson}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Apply JSON to editor
            </button>
          </div>
        </details>
      </aside>
    </div>
  );
}

function FieldDetail({
  field,
  onChange,
  onChangePreset,
  onChangeAssignedTo,
  onDelete,
}: {
  field: EditorField;
  onChange: (p: Partial<EditorField>) => void;
  onChangePreset: (newPreset: FieldPreset) => void;
  onChangeAssignedTo: (assigned: TemplateSignerRole) => void;
  onDelete: () => void;
}) {
  const currentPreset = presetForField(field);
  const isSignatureType = field.field_type === "signature";
  return (
    <div className="mt-3 space-y-3 text-xs">
      <label className="block font-medium text-slate-700">
        Field label
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block font-medium text-slate-700">
          Field type
          <select
            value={currentPreset}
            onChange={(e) => onChangePreset(e.target.value as FieldPreset)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            {PRESET_ORDER.map((p) => (
              <option key={p} value={p}>
                {presetLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-medium text-slate-700">
          Assigned to
          <select
            value={field.signer_role}
            onChange={(e) => onChangeAssignedTo(e.target.value as TemplateSignerRole)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            {ASSIGNED_TO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 font-medium text-slate-700">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onChange({ required: e.target.checked })}
        />
        Required
      </label>

      {!isSignatureType ? (
        <>
          <label className="block font-medium text-slate-700">
            Auto-fill source
            <select
              value={field.autofill_source}
              onChange={(e) =>
                onChange({ autofill_source: e.target.value as PdfSignAutofillSource })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {AUTOFILL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={field.signer_editable}
              onChange={(e) => onChange({ signer_editable: e.target.checked })}
            />
            Editable by signer
          </label>
        </>
      ) : null}

      <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Advanced settings
        </summary>
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
          <label className="block font-medium text-slate-700">
            Field key
            <input
              value={field.field_key}
              onChange={(e) =>
                onChange({
                  field_key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-slate-600">
              Page
              <input
                type="number"
                min={1}
                value={field.page_index + 1}
                onChange={(e) =>
                  onChange({ page_index: Math.max(0, Number(e.target.value) - 1) })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-slate-600">
              Font size
              <input
                type="number"
                min={6}
                max={36}
                value={field.font_size}
                onChange={(e) => onChange({ font_size: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["x", field.x],
                ["y", field.y],
                ["width", field.width],
                ["height", field.height],
              ] as const
            ).map(([key, value]) => (
              <label key={key} className="block text-slate-600">
                {key}
                <input
                  type="number"
                  value={Math.round(value * 10) / 10}
                  onChange={(e) =>
                    onChange({ [key]: Number(e.target.value) } as Partial<EditorField>)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
          <label className="block text-slate-600">
            AcroForm field name (optional)
            <input
              value={field.pdf_acroform_field_name || ""}
              onChange={(e) => onChange({ pdf_acroform_field_name: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px]"
            />
          </label>
          {field.signer_role === "admin" ? (
            <label className="block text-slate-600">
              Prefill value (optional)
              <input
                value={field.prefill_value || ""}
                onChange={(e) => onChange({ prefill_value: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={field.autofit_text}
              onChange={(e) => onChange({ autofit_text: e.target.checked })}
            />
            Auto-fit text in box (PDF)
          </label>
        </div>
      </details>

      <button
        type="button"
        onClick={onDelete}
        className="w-full rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
      >
        Delete this field
      </button>
    </div>
  );
}

function FieldsOnTemplate({
  fields,
  selectedId,
  onPick,
}: {
  fields: EditorField[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const sorted = useMemo(() => {
    return [...fields].sort(
      (a, b) => a.page_index - b.page_index || b.y - a.y || a.x - b.x
    );
  }, [fields]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Fields on this template</h3>
        <span className="text-[11px] text-slate-500">
          {fields.length} field{fields.length === 1 ? "" : "s"}
        </span>
      </div>
      {fields.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          No fields yet. Click the PDF or use Add field above.
        </p>
      ) : (
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {sorted.map((f) => {
            const isSelected = selectedId === f.id;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onPick(f.id)}
                  className={
                    "flex w-full flex-col gap-1 border-l-4 px-2 py-2 text-left text-xs transition " +
                    (isSelected
                      ? "border-l-indigo-600 bg-indigo-50 text-slate-900 ring-1 ring-inset ring-slate-200/80"
                      : "border-l-slate-300 text-slate-800 hover:bg-slate-50")
                  }
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                      {f.label || <em className="text-slate-400">Untitled</em>}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium text-slate-500">
                      Page {f.page_index + 1}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, n));
}

function mapStoredToEditor(f: LoadedTemplate["fields"][number]): EditorField {
  const ft = (f.field_type as PdfSignFieldType) || "text";
  const opts = (f.options || {}) as {
    validation_kind?: string;
    autofill_source?: string;
    autofit_text?: boolean;
    signer_editable?: boolean;
    signer_role?: string;
  };
  const fallback = FIELD_PRESETS[ft === "tin" ? "tin" : (ft as FieldPreset)] ?? FIELD_PRESETS.text;
  const validAf: PdfSignAutofillSource =
    AUTOFILL_OPTIONS.some((o) => o.value === opts.autofill_source) && opts.autofill_source
      ? (opts.autofill_source as PdfSignAutofillSource)
      : "none";
  return {
    id: f.id,
    field_key: f.field_key,
    label: f.label,
    field_type: ft,
    validation_kind:
      typeof opts.validation_kind === "string" && opts.validation_kind
        ? opts.validation_kind
        : null,
    autofill_source: validAf,
    signer_role: normalizeSignerRole(f.signer_role || opts.signer_role),
    required: f.required !== false,
    required_order: f.required_order ?? 0,
    page_index: f.page_index ?? 0,
    page_width: typeof f.page_width === "number" ? f.page_width : 612,
    page_height: typeof f.page_height === "number" ? f.page_height : 792,
    x: f.x ?? 50,
    y: f.y ?? 50,
    width: f.width ?? fallback.width,
    height: f.height ?? fallback.height,
    font_size: f.font_size ?? fallback.fontSize,
    pdf_acroform_field_name: f.pdf_acroform_field_name,
    prefill_value: f.prefill_value,
    is_suggestion: false,
    autofit_text: opts.autofit_text !== false,
    signer_editable: opts.signer_editable !== false,
  };
}

function toAdvancedJson(fields: EditorField[]) {
  return fields.map((f, i) => ({
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    required: f.required,
    required_order: i,
    page_index: f.page_index,
    page_width: f.page_width,
    page_height: f.page_height,
    x: Math.round(f.x * 10) / 10,
    y: Math.round(f.y * 10) / 10,
    width: Math.round(f.width * 10) / 10,
    height: Math.round(f.height * 10) / 10,
    font_size: f.font_size,
    pdf_acroform_field_name: f.pdf_acroform_field_name,
    prefill_value: f.prefill_value,
    options: {
      ...(f.validation_kind ? { validation_kind: f.validation_kind } : {}),
      ...(f.autofill_source && f.autofill_source !== "none"
        ? { autofill_source: f.autofill_source }
        : {}),
      signer_role: f.signer_role,
      autofit_text: f.autofit_text,
      signer_editable: f.signer_editable,
    },
  }));
}
