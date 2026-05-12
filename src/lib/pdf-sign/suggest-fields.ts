import "server-only";

import type { PdfSignFieldType } from "@/lib/pdf-sign/constants";

type SuggestionSignerParty = "sender" | "recipient";

// IMPORTANT: this module runs on the Node server only. We deliberately DO NOT
// load pdfjs's worker bundle here - on Node, Turbopack mangles the dynamic
// `pdf.worker.mjs` import path and crashes ("Cannot find module
// .../node_modules/legacy/build/pdf.worker.mjs"). Setting `disableWorker: true`
// on `getDocument()` runs the parser inline in the same process - slower but
// 100% reliable, and we only scan a few pages of small contracts.

export type SuggestedField = {
  field_key: string;
  label: string;
  field_type: PdfSignFieldType;
  signer_role: SuggestionSignerParty;
  page_index: number;
  page_width: number;
  page_height: number;
  /** PDF coordinates: bottom-left origin, points. */
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  font_size: number;
  source: "label_match" | "blank_line" | "fallback";
  /** Free-form note for the editor UI explaining why this was suggested. */
  hint: string;
};

export type PdfSuggestionResult = {
  pages: Array<{ pageIndex: number; width: number; height: number }>;
  suggestions: SuggestedField[];
  acroformFields: Array<{ name: string; type: string; page_index: number | null }>;
};

/**
 * Common PDF text-content patterns that map to a known field role.
 * Order matters: more specific patterns come first.
 */
const LABEL_PATTERNS: Array<{
  match: RegExp;
  field_type: PdfSignFieldType;
  field_key_base: string;
  label: string;
  signer_role: SuggestionSignerParty;
  default_width: number;
}> = [
  {
    match: /\b(employee|worker|staff)\s*(printed\s*)?name\s*[:_]?$/i,
    field_type: "name",
    field_key_base: "employee_name",
    label: "Employee name",
    signer_role: "recipient",
    default_width: 220,
  },
  {
    match: /\b(employee|worker|staff)\s*signature\s*[:_]?$/i,
    field_type: "signature",
    field_key_base: "employee_signature",
    label: "Employee signature",
    signer_role: "recipient",
    default_width: 220,
  },
  {
    match: /\b(employee|worker|staff)\s*date\s*[:_]?$/i,
    field_type: "date",
    field_key_base: "employee_date",
    label: "Employee date",
    signer_role: "recipient",
    default_width: 110,
  },
  {
    match: /\b(saintly|company|representative|rep|employer)\s*(printed\s*)?name\s*[:_]?$/i,
    field_type: "name",
    field_key_base: "company_representative_name",
    label: "Saintly representative name",
    signer_role: "sender",
    default_width: 220,
  },
  {
    match: /\b(saintly|company|representative|rep|employer)\s*signature\s*[:_]?$/i,
    field_type: "signature",
    field_key_base: "company_representative_signature",
    label: "Saintly representative signature",
    signer_role: "sender",
    default_width: 220,
  },
  {
    match: /\b(saintly|company|representative|rep|employer)\s*date\s*[:_]?$/i,
    field_type: "date",
    field_key_base: "company_representative_date",
    label: "Saintly representative date",
    signer_role: "sender",
    default_width: 110,
  },
  {
    match: /\binitials?\s*[:_]?$/i,
    field_type: "initials",
    field_key_base: "initials",
    label: "Initials",
    signer_role: "recipient",
    default_width: 70,
  },
  {
    match: /\b(printed\s*name|print\s*name|full\s*name)\s*[:_]?$/i,
    field_type: "name",
    field_key_base: "printed_name",
    label: "Printed name",
    signer_role: "recipient",
    default_width: 220,
  },
  {
    match: /\bsignature\s*[:_]?$/i,
    field_type: "signature",
    field_key_base: "signature",
    label: "Signature",
    signer_role: "recipient",
    default_width: 220,
  },
  {
    match: /\bsigned?\s*on?\s*[:_]?$|^date\s*[:_]?$|\b(date\s*signed|signing\s*date)\s*[:_]?$/i,
    field_type: "date",
    field_key_base: "date",
    label: "Date",
    signer_role: "recipient",
    default_width: 110,
  },
  {
    match: /\b(name|applicant|contractor)\s*[:_]?$/i,
    field_type: "name",
    field_key_base: "name",
    label: "Name",
    signer_role: "recipient",
    default_width: 220,
  },
  {
    match: /\backnowledg(e|ment|ed)\b/i,
    field_type: "checkbox",
    field_key_base: "acknowledgment",
    label: "Acknowledgment",
    signer_role: "recipient",
    default_width: 18,
  },
];

type RawTextItem = { str: string; transform: number[]; width: number; height: number };

function dedupeFieldKey(used: Set<string>, base: string): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  const k = `${base}_${i}`;
  used.add(k);
  return k;
}

/**
 * Build suggested form fields by scanning the PDF text + page dimensions.
 * Coordinates returned are in PDF user-space points with a bottom-left origin.
 */
export async function suggestFieldsFromPdfBytes(input: Uint8Array): Promise<PdfSuggestionResult> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(input.length);
  data.set(input);
  // `disableWorker: true` keeps everything in-process so we don't try to load
  // pdf.worker.mjs on the server (which Turbopack mishandles). Combined with
  // `useWorkerFetch: false` and `isEvalSupported: false` this is the documented
  // safe configuration for Node.js scripts that only need text extraction.
  const loadingTask = getDocument({
    data,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pages: PdfSuggestionResult["pages"] = [];
  const suggestions: SuggestedField[] = [];
  const usedKeys = new Set<string>();
  const acroformFields: PdfSuggestionResult["acroformFields"] = [];

  try {
    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;
      pages.push({ pageIndex, width: pageWidth, height: pageHeight });

      // ---- AcroForm annotations (best signal of all) ------------------------
      try {
        const annotations = await page.getAnnotations();
        for (const ann of annotations) {
          const a = ann as {
            subtype?: string;
            fieldName?: string;
            fieldType?: string;
            rect?: number[];
          };
          if (a.subtype !== "Widget" || !a.fieldName) continue;
          acroformFields.push({
            name: a.fieldName,
            type: typeof a.fieldType === "string" ? a.fieldType : "Tx",
            page_index: pageIndex,
          });
          if (Array.isArray(a.rect) && a.rect.length === 4) {
            const [x1, y1, x2, y2] = a.rect;
            const x = Math.min(x1, x2);
            const y = Math.min(y1, y2);
            const width = Math.abs(x2 - x1);
            const height = Math.abs(y2 - y1);
            const rawType = (a.fieldType || "Tx").toString();
            const ft: PdfSignFieldType =
              rawType === "Btn"
                ? "checkbox"
                : rawType === "Sig"
                  ? "signature"
                  : "text";
            const labelGuess = humanizeAcroFieldName(a.fieldName);
            const baseKey = a.fieldName
              .replace(/[^a-zA-Z0-9_]+/g, "_")
              .replace(/^_+|_+$/g, "")
              .toLowerCase() || "acro_field";
            suggestions.push({
              field_key: dedupeFieldKey(usedKeys, baseKey),
              label: labelGuess,
              field_type: ft,
              signer_role: "recipient",
              page_index: pageIndex,
              page_width: pageWidth,
              page_height: pageHeight,
              x,
              y,
              width: Math.max(40, width),
              height: Math.max(14, height),
              required: ft === "signature",
              font_size: ft === "signature" ? 14 : 11,
              source: "label_match",
              hint: `AcroForm field "${a.fieldName}"`,
            });
          }
        }
      } catch {
        /* page has no annotations - ignore */
      }

      // ---- Heuristic text/label scan ----------------------------------------
      const tc = await page.getTextContent({ includeMarkedContent: false });
      const items = (tc.items || []) as RawTextItem[];
      for (const item of items) {
        const text = (item.str || "").trim();
        if (!text || text.length < 2) continue;
        const matched = LABEL_PATTERNS.find((p) => p.match.test(text));
        if (!matched) continue;
        const xPdf = item.transform[4];
        const yPdf = item.transform[5];
        const labelWidth = item.width || 60;
        const labelHeight = item.height || 12;
        const fieldHeight =
          matched.field_type === "signature"
            ? Math.max(28, labelHeight * 2.4)
            : matched.field_type === "checkbox"
              ? 16
              : Math.max(20, labelHeight * 1.5);
        // Place the field to the right of the label (or just below for narrow labels).
        const placeRight = pageWidth - (xPdf + labelWidth) > matched.default_width + 12;
        const x = placeRight ? xPdf + labelWidth + 6 : xPdf;
        const y = placeRight ? Math.max(0, yPdf - fieldHeight * 0.2) : Math.max(0, yPdf - fieldHeight - 4);
        const width = Math.min(matched.default_width, Math.max(60, pageWidth - x - 24));
        const baseKey = `${matched.field_key_base}`;
        suggestions.push({
          field_key: dedupeFieldKey(usedKeys, baseKey),
          label: matched.label,
          field_type: matched.field_type,
          signer_role: matched.signer_role,
          page_index: pageIndex,
          page_width: pageWidth,
          page_height: pageHeight,
          x,
          y,
          width,
          height: fieldHeight,
          required: matched.field_type !== "checkbox",
          font_size: matched.field_type === "signature" ? 16 : 11,
          source: "label_match",
          hint: `Detected label "${text}" on page ${pageIndex + 1}`,
        });
      }
    }

    // Suggestion cap: keep the editor sane.
    const trimmed = suggestions.slice(0, 60);
    return { pages, suggestions: trimmed, acroformFields };
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* noop */
    }
  }
}

function humanizeAcroFieldName(name: string): string {
  const words = name
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
