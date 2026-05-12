/**
 * PDF Sign · template packet document_type. Canonical DB values only.
 * Safe for client + server import (no Node-only deps).
 */

export type PdfSignDocumentType = "generic_contract" | "w9" | "i9";

/** Admin dropdown: canonical value → human-readable label (never sluggy). */
export const PDF_SIGN_DOCUMENT_TYPE_ADMIN_OPTIONS: {
  value: PdfSignDocumentType;
  /** Shown in selects and summaries */
  adminLabel: string;
}[] = [
  { value: "generic_contract", adminLabel: "Agreement / Contract" },
  { value: "w9", adminLabel: "IRS Form W-9" },
  { value: "i9", adminLabel: "Form I-9" },
];

/**
 * Normalize free text, legacy slugs, or accidental labels to a canonical type.
 * Returns null only when nothing recognizable remains (caller should reject or default).
 */
export function normalizePdfSignDocumentType(raw: string | null | undefined): PdfSignDocumentType | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;

  /** Legacy / wizard slugs stored before canonical-only enforcement */
  const legacySlugMap: Record<string, PdfSignDocumentType> = {
    territory_manager_contract: "generic_contract",
    genericcontract: "generic_contract",
    contract: "generic_contract",
    agreement: "generic_contract",
    custom: "generic_contract",
    generic: "generic_contract",
    /** Common mistake: human phrase stored as slug */
    irs_form_w_9: "w9",
    irs_form_w9: "w9",
    form_i_9: "i9",
    form_i9: "i9",
  };

  /** Lowercase-like comparison for human labels */
  const flat = s
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

  const slug = s
    .trim()
    .toLowerCase()
    .replace(/[\s\u2013\u2014-]+/g, "_")
    .replace(/_+/g, "_");

  const direct =
    slug === "generic_contract" || slug === "genericcontract"
      ? "generic_contract"
      : slug === "w9"
        ? "w9"
        : slug === "i9"
          ? "i9"
          : null;
  if (direct) return direct;

  if (legacySlugMap[slug]) return legacySlugMap[slug];

  if (flat.includes("irs") && flat.includes("w9")) return "w9";
  if (flat.includes("form") && flat.includes("i9")) return "i9";
  if (flat.includes("i9") && !flat.includes("w9")) return "i9";
  /** Agreement / generic contract wording */
  if (
    flat.includes("agreement") ||
    flat.includes("contract") ||
    flat.includes("generic") ||
    flat.includes("territorymanager")
  ) {
    return "generic_contract";
  }

  return null;
}

/** @deprecated Prefer PDF_SIGN_DOCUMENT_TYPE_ADMIN_OPTIONS.adminLabel mappings */
export function pdfSignDocumentTypeAdminLabel(type: string | null | undefined): string {
  const c = normalizePdfSignDocumentType(type);
  const row = PDF_SIGN_DOCUMENT_TYPE_ADMIN_OPTIONS.find((o) => o.value === c);
  return row?.adminLabel ?? (type?.trim() || "Agreement / Contract");
}

export function isPdfSignCanonicalDocumentType(v: string | null | undefined): v is PdfSignDocumentType {
  const n = normalizePdfSignDocumentType(v);
  return n !== null;
}
