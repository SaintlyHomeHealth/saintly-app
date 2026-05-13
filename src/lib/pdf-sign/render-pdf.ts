import "server-only";

import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { decryptSensitiveField } from "@/lib/pdf-sign/field-crypto";
import {
  getSingleLineFontSize,
  signatureImageDrawRectPdf,
  textBaselinePdfY,
} from "@/lib/pdf-sign/pdf-render-field-placement";

export type RenderFieldInput = {
  field_key: string;
  field_type: string;
  pdf_acroform_field_name: string | null;
  page_index: number;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  font_size: number;
  /** Raw display value; optional cipher for tin fields */
  text_value: string | null;
  tin_ciphertext?: string | null;
  /** Drawn PNG (sender / typed capture) flattened onto absolute boxes */
  signature_png_bytes?: Uint8Array | null;
};

function decodeValue(f: RenderFieldInput): string {
  if (f.field_type === "tin" && f.tin_ciphertext) {
    try {
      return decryptSensitiveField(f.tin_ciphertext);
    } catch {
      return "";
    }
  }
  if (f.field_type === "checkbox") {
    const t = (f.text_value || "").toLowerCase();
    if (t === "true" || t === "yes" || t === "1") return "Yes";
    return "";
  }
  return (f.text_value || "").trim();
}

export async function renderSignedPdf(input: {
  templateBytes: Uint8Array;
  fields: RenderFieldInput[];
}): Promise<{ pdfBytes: Uint8Array; sha256: string }> {
  const pdfDoc = await PDFDocument.load(input.templateBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const acroNames = input.fields
    .map((f) => f.pdf_acroform_field_name?.trim())
    .filter((n): n is string => Boolean(n));

  if (acroNames.length > 0) {
    try {
      const form = pdfDoc.getForm();
      for (const f of input.fields) {
        const name = f.pdf_acroform_field_name?.trim();
        if (!name) continue;
        const value = decodeValue(f);
        try {
          const tf = form.getTextField(name);
          tf.setText(value);
        } catch {
          try {
            const cb = form.getCheckBox(name);
            if (value.toLowerCase() === "yes" || value === "true" || value === "1") {
              cb.check();
            } else {
              cb.uncheck();
            }
          } catch {
            /* ignore missing acroform field */
          }
        }
      }
      try {
        form.flatten();
      } catch {
        /* no-op */
      }
    } catch {
      /* PDF has no form */
    }
  }

  type DrawOp =
    | { kind: "text"; pageIndex: number; f: RenderFieldInput; lines: string[] }
    | {
        kind: "png";
        pageIndex: number;
        f: RenderFieldInput;
        png: Uint8Array;
      };

  const drawOps: DrawOp[] = [];

  for (const f of input.fields) {
    if (f.pdf_acroform_field_name?.trim()) continue;
    if (f.x == null || f.y == null) continue;
    const pageIndex = Math.max(0, f.page_index);

    const isSigKind =
      (f.field_type === "signature" || f.field_type === "initials") &&
      f.signature_png_bytes &&
      f.signature_png_bytes.length > 0;

    if (isSigKind) {
      drawOps.push({
        kind: "png",
        pageIndex,
        f,
        png: f.signature_png_bytes as Uint8Array,
      });
      continue;
    }

    const v = decodeValue(f);
    if (!v) continue;
    const lines =
      f.field_type === "textarea"
        ? v.split(/\r?\n/).flatMap((line) =>
            line.length ? [line.slice(0, 500)] : []
          )
        : [v.slice(0, 500)];
    if (lines.length === 0) continue;
    drawOps.push({ kind: "text", pageIndex, f, lines });
  }

  const byPage = new Map<number, DrawOp[]>();
  for (const op of drawOps) {
    const list = byPage.get(op.pageIndex) ?? [];
    list.push(op);
    byPage.set(op.pageIndex, list);
  }

  for (const [, list] of byPage) {
    for (const op of list) {
      const page = pdfDoc.getPage(op.pageIndex);
      const f = op.f;
      /** Stored x,y,width,height are PDF user-space coords (bottom-left rect origin). */
      const fieldXLl = f.x ?? 0;
      const fieldYLl = f.y ?? 0;
      const fieldW = typeof f.width === "number" && f.width > 2 ? f.width : 140;
      const fieldH = typeof f.height === "number" && f.height > 2 ? f.height : 24;

      if (op.kind === "png") {
        try {
          const img = await pdfDoc.embedPng(op.png);
          const boxW = typeof f.width === "number" && f.width > 4 ? f.width : Math.max(img.width * 0.15, 80);
          const boxH = typeof f.height === "number" && f.height > 4 ? f.height : Math.max(img.height * 0.15, 36);
          const { x: dx, y: dy, width: dw, height: dh } = signatureImageDrawRectPdf({
            fieldXPdf: fieldXLl,
            fieldYPdf: fieldYLl,
            fieldWidthPdf: boxW,
            fieldHeightPdf: boxH,
            imageWidthPx: img.width,
            imageHeightPx: img.height,
          });
          page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
        } catch {
          /* ignore malformed png */
        }
        continue;
      }

      const fullText = op.lines.join(" ");
      const singleLineFs = getSingleLineFontSize(fieldH, fullText.length);
      const cappedTemplate =
        f.font_size > 4 && f.font_size < 48 ? Math.min(f.font_size, 12) : 11;
      let fontSize = Math.min(singleLineFs, cappedTemplate);
      fontSize = Math.max(8, Math.min(11, fontSize));

      if (op.lines.length <= 1) {
        const v = fullText;
        const baseline = textBaselinePdfY({
          fieldBottomYPdf: fieldYLl,
          fieldHeightPdf: fieldH,
          fontSize,
        });

        page.drawText(v, {
          x: fieldXLl + Math.max(2, fieldW * 0.03),
          y: baseline,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      } else {
        const padX = Math.max(2, fieldW * 0.03);
        const lineFs = Math.max(
          8,
          Math.min(fontSize, (fieldH - 14) / Math.max(op.lines.length, 5))
        );
        const lineLeading = lineFs + 3;
        const padTop = Math.max(4, Math.min(fieldH * 0.1, 12));
        let lineY = fieldYLl + fieldH - padTop;
        const floorY = fieldYLl + Math.max(lineFs * 0.35, 4);
        for (const lnRaw of op.lines) {
          const ln = lnRaw.trim().slice(0, 480);
          if (!ln) continue;
          if (lineY < floorY) break;
          page.drawText(ln, {
            x: fieldXLl + padX,
            y: lineY,
            size: lineFs,
            font,
            color: rgb(0, 0, 0),
          });
          lineY -= lineLeading;
        }
      }
    }
  }

  const out = await pdfDoc.save();
  const sha256 = createHash("sha256").update(out).digest("hex");
  return { pdfBytes: out, sha256 };
}
