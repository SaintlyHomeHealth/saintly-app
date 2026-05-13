import { signerPartyFromField } from "@/lib/pdf-sign/normalize";

export type TemplateLike = {
  field_key: string;
  label: string;
  field_type: string;
  signer_role?: string | null;
  options?: unknown;
  required?: boolean | null | undefined;
  /** Stored 0-based in DB; omit if unknown */
  page_index?: number | null;
};

const GENERIC_LABEL_LOWERCASE = new Set([
  "text field",
  "text area",
  "signature",
  "date",
  "checkbox",
  "name",
  "number only",
  "tin",
]);

/** Shared with template editor hints (duplicate generic placeholders). */
export const GENERIC_PDF_SIGN_PLACEHOLDER_LABELS_LOWER = GENERIC_LABEL_LOWERCASE;

const FIELD_TYPE_DISPLAY: Record<string, string> = {
  text: "Text field",
  textarea: "Text area",
  date: "Date",
  checkbox: "Checkbox",
  signature: "Signature",
  initials: "Initials",
  name: "Name",
  tin: "Tax ID number",
  select: "Select",
};

export type SaintlyPrefillIssue = { field_key: string; message: string };

/** Same rules as send validation — also used by PDF overlay UI. */
export function fieldIsEffectivelyOptional(f: TemplateLike): boolean {
  if (f.required === false) return true;
  return !!(
    f.options &&
    typeof f.options === "object" &&
    (f.options as { optional?: boolean }).optional === true
  );
}

/** One-line locator for admins (Send packet Step 4, validation errors). */
export function formatSaintlySendFieldHeading(f: TemplateLike): string {
  const pi = typeof f.page_index === "number" && f.page_index >= 0 ? f.page_index + 1 : null;
  const pagePart = pi != null ? `Page ${pi}` : null;
  const typeHuman =
    FIELD_TYPE_DISPLAY[f.field_type] ||
    f.field_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const label = (f.label || "").trim();
  const labelIsGeneric = !label || GENERIC_LABEL_LOWERCASE.has(label.toLowerCase());
  const core = labelIsGeneric ? typeHuman : `${label} · ${typeHuman}`;
  const reqPart = fieldIsEffectivelyOptional(f) ? "Optional" : "Required";
  const parts = [pagePart, core, reqPart].filter(Boolean) as string[];
  return parts.join(" · ");
}

function incompleteSaintlyCopy(kind: "value" | "checkbox" | "signature", f: TemplateLike): string {
  const page = typeof f.page_index === "number" && f.page_index >= 0 ? f.page_index + 1 : null;
  const pagePart = page != null ? `Page ${page}` : "Page unknown";
  const typeHuman =
    FIELD_TYPE_DISPLAY[f.field_type] ||
    (f.field_type ? f.field_type.replace(/_/g, " ") : "field");
  const label = (f.label || "").trim();
  const labelIsGeneric = !label || GENERIC_LABEL_LOWERCASE.has(label.toLowerCase());

  const bracket =
    labelIsGeneric || kind === "signature"
      ? `${pagePart} · ${labelIsGeneric ? typeHuman : `${label} · ${typeHuman}`}`
      : `${pagePart} · ${label} · ${typeHuman}`;

  if (kind === "checkbox") {
    return `Please complete the required Saintly field (check the box): ${bracket}.`;
  }
  if (kind === "signature") {
    return `Please complete the required Saintly field: ${bracket}.`;
  }
  return `Please complete the required Saintly field: ${bracket}.`;
}

/** Fields completed by Saintly in admin send flows (anything not routed to recipient portal). */
export function senderAssignableTemplateFields(rows: TemplateLike[]): TemplateLike[] {
  return rows.filter((f) => signerPartyFromField(f) === "sender");
}

/**
 * Ordered list of blocking issues. First item matches legacy single-string validation semantics.
 */
export function collectSaintlySenderPrefillIssues(input: {
  templateFields: TemplateLike[];
  senderValues: Record<string, string | boolean>;
  senderSignatureImages: Record<string, string>;
}): SaintlyPrefillIssue[] {
  const issues: SaintlyPrefillIssue[] = [];
  const byKey = new Map<string, TemplateLike>();
  for (const f of input.templateFields) {
    byKey.set(f.field_key, f);
  }
  const senderSide = senderAssignableTemplateFields(input.templateFields);
  const senderSideByKey = new Map(senderSide.map((f) => [f.field_key, f]));

  for (const key of Object.keys(input.senderValues)) {
    const meta = byKey.get(key);
    if (!meta || signerPartyFromField(meta) !== "sender") {
      issues.push({ field_key: key, message: `Unsupported Saintly-side field "${key}".` });
    }
  }
  for (const key of Object.keys(input.senderSignatureImages)) {
    const meta = senderSideByKey.get(key);
    if (!meta) {
      issues.push({ field_key: key, message: `Unsupported Saintly signature field "${key}".` });
    } else if (meta.field_type !== "signature" && meta.field_type !== "initials") {
      issues.push({
        field_key: key,
        message: `Saintly signature upload is only for signature fields (${key}).`,
      });
    }
  }

  for (const f of senderSide) {
    if (fieldIsEffectivelyOptional(f)) continue;
    if (f.field_type === "signature" || f.field_type === "initials") {
      const sk = input.senderSignatureImages[f.field_key];
      const hasSketch = typeof sk === "string" && sk.trim().length > 0;
      const hasTyped =
        input.senderValues[f.field_key] != null && String(input.senderValues[f.field_key]).trim() !== "";
      if (!hasSketch && !hasTyped) {
        issues.push({
          field_key: f.field_key,
          message: incompleteSaintlyCopy("signature", f),
        });
      }
      continue;
    }
    if (f.field_type === "checkbox") {
      const v = input.senderValues[f.field_key];
      if (v !== true && v !== "true" && v !== "yes") {
        issues.push({
          field_key: f.field_key,
          message: incompleteSaintlyCopy("checkbox", f),
        });
      }
      continue;
    }
    const v = input.senderValues[f.field_key];
    if (v == null || String(v).trim() === "") {
      issues.push({
        field_key: f.field_key,
        message: incompleteSaintlyCopy("value", f),
      });
    }
  }

  return issues;
}

export function validateSenderPrefillAgainstTemplate(input: {
  templateFields: TemplateLike[];
  senderValues: Record<string, string | boolean>;
  senderSignatureImages: Record<string, string>;
}): string | null {
  const issues = collectSaintlySenderPrefillIssues(input);
  return issues[0]?.message ?? null;
}
