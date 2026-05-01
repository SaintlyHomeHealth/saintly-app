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
  font_size: number;
  /** Raw display value; optional cipher for tin fields */
  text_value: string | null;
  tin_ciphertext?: string | null;
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

  const byPage = new Map<number, RenderFieldInput[]>();
  for (const f of input.fields) {
    if (f.pdf_acroform_field_name?.trim()) continue;
    if (f.x == null || f.y == null) continue;
    const v = decodeValue(f);
    if (!v) continue;
    const pageIndex = Math.max(0, f.page_index);
    const list = byPage.get(pageIndex) ?? [];
    list.push(f);
    byPage.set(pageIndex, list);
  }

  for (const [pageIndex, list] of byPage) {
    const page = pdfDoc.getPage(pageIndex);
    const { height } = page.getSize();
    for (const f of list) {
      const v = decodeValue(f);
      if (!v) continue;
      const size = f.font_size > 4 && f.font_size < 48 ? f.font_size : 10;
      const x = f.x ?? 0;
      const yRaw = f.y ?? 0;
      const y = yRaw <= height + 1 ? yRaw : height - yRaw;
      page.drawText(v, {
        x,
        y,
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
