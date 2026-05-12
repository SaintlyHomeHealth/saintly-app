/**
 * Canonical PDF Sign enums + legacy normalization. Safe on client/server.
 */

export const PDF_SIGN_CANONICAL_SIGNER_ROLES = ["sender", "recipient"] as const;
export type PdfSignCanonicalSignerRole = (typeof PDF_SIGN_CANONICAL_SIGNER_ROLES)[number];

/**
 * Persisted signer roles for new templates — only sender / recipient.
 * Legacy CRM-style roles normalize into these buckets.
 */
export function normalizeSignerRole(role: string | null | undefined): PdfSignCanonicalSignerRole {
  const r = String(role ?? "").trim().toLowerCase();
  switch (r) {
    case "sender":
    case "saintly":
    case "admin":
    case "company":
    case "internal":
    case "prefilled":
      return "sender";
    case "recipient":
    case "signer":
    case "employee":
    case "contractor":
    case "recruit":
    case "lead":
      return "recipient";
    default:
      return "recipient";
  }
}

/** Shorthand: true = Saintly completes in admin (or prefilled state); false = external signer portal. */
export function isSignerRoleAssignedToRecipient(role: string | null | undefined): boolean {
  return normalizeSignerRole(role) === "recipient";
}

export function signerRoleStoredFromOptions(opts: Record<string, unknown> | null | undefined): string | null {
  const v = opts?.signer_role;
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null;
}

export function signerRoleStoredFromColumns(input: {
  signer_role?: string | null;
  options?: unknown;
}): string | null {
  const col = input.signer_role?.trim().toLowerCase();
  const fromOpts = signerRoleStoredFromOptions(
    input.options && typeof input.options === "object" ? (input.options as Record<string, unknown>) : null
  );
  const raw = col ?? fromOpts ?? null;
  return raw ?? null;
}

/** Prefer DB column then options when resolving raw role before canonicalizing. */
export function signerPartyFromField(field: {
  signer_role?: string | null;
  options?: unknown;
}): PdfSignCanonicalSignerRole {
  return normalizeSignerRole(signerRoleStoredFromColumns(field) || undefined);
}

export const PDF_SIGN_EDITABLE_FIELD_TYPES = [
  "text",
  "textarea",
  "date",
  "checkbox",
  "signature",
  "name",
  "tin",
  "select",
] as const;

export type PdfSignEditableFieldType = (typeof PDF_SIGN_EDITABLE_FIELD_TYPES)[number];

/**
 * Recipient UI + PDF text rendering treats legacy `tin`/`select` like plain text boxes.
 */
export function fieldTypeTreatAsText(ft: string | null | undefined): boolean {
  const t = String(ft ?? "").toLowerCase();
  return t === "tin" || t === "select" || t === "name";
}

export function fieldTypeNormalizeForPersist(ft: string | null | undefined): string {
  return String(ft ?? "text").trim().toLowerCase() || "text";
}
