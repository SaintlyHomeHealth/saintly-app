import "server-only";

import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { decryptSensitiveField } from "@/lib/pdf-sign/field-crypto";

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
    | { kind: "text"; pageIndex: number; f: RenderFieldInput }
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
    drawOps.push({ kind: "text", pageIndex, f });
  }

  const byPage = new Map<number, DrawOp[]>();
  for (const op of drawOps) {
    const list = byPage.get(op.pageIndex) ?? [];
    list.push(op);
    byPage.set(op.pageIndex, list);
  }

  for (const [pageIndex, list] of byPage) {
    const page = pdfDoc.getPage(pageIndex);
    const { height } = page.getSize();
    for (const op of list) {
      const f = op.f;
      const x = f.x ?? 0;
      const yRaw = f.y ?? 0;
      const yPdf = yRaw <= height + 1 ? yRaw : height - yRaw;

      if (op.kind === "png") {
        try {
          const img = await pdfDoc.embedPng(op.png);
          const boxW =
            typeof f.width === "number" && f.width > 4 ? f.width : Math.max(img.width * 0.15, 80);
          const boxH =
            typeof f.height === "number" && f.height > 4 ? f.height : Math.max(img.height * 0.15, 36);
          const iw = img.width;
          const ih = img.height;
          const sx = Math.min(boxW / iw, boxH / ih);
          const dw = iw * sx;
          const dh = ih * sx;
          const dy = Math.max(yPdf + (boxH - dh) / 2, 4);
          const dx = x;
          page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
        } catch {
          /* ignore malformed png */
        }
        continue;
      }

      const v = decodeValue(f);
      if (!v) continue;
      const size = f.font_size > 4 && f.font_size < 48 ? f.font_size : 10;
      page.drawText(v, {
        x,
        y: yPdf,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  const out = await pdfDoc.save();
  const sha256 = createHash("sha256").update(out).digest("hex");
  return { pdfBytes: out, sha256 };
}
