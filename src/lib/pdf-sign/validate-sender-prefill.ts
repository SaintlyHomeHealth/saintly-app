import { signerPartyFromField } from "@/lib/pdf-sign/normalize";

type TemplateLike = {
  field_key: string;
  label: string;
  field_type: string;
  signer_role?: string | null;
  options?: unknown;
  required: boolean | null | undefined | boolean;
};

function fieldIsEffectivelyOptional(f: TemplateLike): boolean {
  if (f.required === false) return true;
  return !!(
    f.options &&
    typeof f.options === "object" &&
    (f.options as { optional?: boolean }).optional === true
  );
}

/** Fields completed by Saintly in admin send flows (anything not routed to recipient portal). */
export function senderAssignableTemplateFields(rows: TemplateLike[]): TemplateLike[] {
  return rows.filter((f) => signerPartyFromField(f) === "sender");
}

/**
 * Server-side enforcement: only keys that belong on sender-internal fields appear in payloads.
 */
export function validateSenderPrefillAgainstTemplate(input: {
  templateFields: TemplateLike[];
  senderValues: Record<string, string | boolean>;
  senderSignatureImages: Record<string, string>;
}): string | null {
  const byKey = new Map<string, TemplateLike>();
  for (const f of input.templateFields) {
    byKey.set(f.field_key, f);
  }
  const senderSide = senderAssignableTemplateFields(input.templateFields);

  const senderSideByKey = new Map(senderSide.map((f) => [f.field_key, f]));

  for (const key of Object.keys(input.senderValues)) {
    const meta = byKey.get(key);
    if (!meta || signerPartyFromField(meta) !== "sender") {
      return `Unsupported Saintly-side field "${key}".`;
    }
  }
  for (const key of Object.keys(input.senderSignatureImages)) {
    const meta = senderSideByKey.get(key);
    if (!meta) {
      return `Unsupported Saintly signature field "${key}".`;
    }
    if (meta.field_type !== "signature" && meta.field_type !== "initials") {
      return `Saintly signature upload is only for signature fields (${key}).`;
    }
  }

  for (const f of senderSide) {
    if (fieldIsEffectivelyOptional(f)) continue;
    const label = f.label || f.field_key;
    if (f.field_type === "signature" || f.field_type === "initials") {
      if (!input.senderSignatureImages[f.field_key] && input.senderValues[f.field_key] == null) {
        return `Saintly field "${label}" is required.`;
      }
      continue;
    }
    if (f.field_type === "checkbox") {
      const v = input.senderValues[f.field_key];
      if (v !== true && v !== "true" && v !== "yes") {
        return `Saintly field "${label}" must be checked.`;
      }
      continue;
    }
    const v = input.senderValues[f.field_key];
    if (v == null || String(v).trim() === "") {
      return `Saintly field "${label}" is required.`;
    }
  }
  return null;
}
