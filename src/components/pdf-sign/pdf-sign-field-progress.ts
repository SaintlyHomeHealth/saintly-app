import { signerPartyFromField, type PdfSignCanonicalSignerRole } from "@/lib/pdf-sign/normalize";
import { fieldIsEffectivelyOptional, type TemplateLike } from "@/lib/pdf-sign/validate-sender-prefill";

export type ProgressField = TemplateLike & {
  required_order: number;
  page_index: number;
  y: number | null;
};

function partyForProgress(mode: "admin_sender" | "recipient"): PdfSignCanonicalSignerRole {
  return mode === "admin_sender" ? "sender" : "recipient";
}

export function isTemplateFieldCompleteForParty(args: {
  f: ProgressField;
  party: PdfSignCanonicalSignerRole;
  textValues: Record<string, string | boolean>;
  signatureImages: Record<string, string | undefined>;
}): boolean {
  const { f, party, textValues, signatureImages } = args;
  if (signerPartyFromField(f) !== party) return true;

  if (fieldIsEffectivelyOptional(f)) return true;

  const fk = f.field_key;
  if (f.field_type === "checkbox") {
    const v = textValues[fk];
    return v === true || v === "true" || v === "yes";
  }
  if (f.field_type === "signature" || f.field_type === "initials") {
    const img = signatureImages[fk];
    const typed =
      textValues[fk] != null && String(textValues[fk]).trim() !== ""
        ? String(textValues[fk]).trim()
        : "";
    return Boolean((typeof img === "string" && img.length > 10) || typed.length > 0);
  }
  const v = textValues[fk];
  return v != null && String(v).trim() !== "";
}

/** Ordered keys for “next required” navigation. */
export function orderedRequiredKeysForParty(
  fields: ProgressField[],
  mode: "admin_sender" | "recipient"
): string[] {
  const party = partyForProgress(mode);
  const mine = fields.filter(
    (f) => signerPartyFromField(f) === party && !fieldIsEffectivelyOptional(f)
  );
  mine.sort((a, b) => {
    if (a.required_order !== b.required_order) return a.required_order - b.required_order;
    if (a.page_index !== b.page_index) return a.page_index - b.page_index;
    const ya = a.y ?? 0;
    const yb = b.y ?? 0;
    return yb - ya;
  });
  return mine.map((f) => f.field_key);
}

export function countRequiredComplete(args: {
  fields: ProgressField[];
  mode: "admin_sender" | "recipient";
  textValues: Record<string, string | boolean>;
  signatureImages: Record<string, string | undefined>;
}): { complete: number; total: number } {
  const party = partyForProgress(args.mode);
  const keys = orderedRequiredKeysForParty(args.fields, args.mode);
  const total = keys.length;
  let complete = 0;
  for (const k of keys) {
    const f = args.fields.find((x) => x.field_key === k);
    if (!f) continue;
    if (
      isTemplateFieldCompleteForParty({
        f,
        party,
        textValues: args.textValues,
        signatureImages: args.signatureImages,
      })
    ) {
      complete += 1;
    }
  }
  return { complete, total };
}

export function nextIncompleteRequiredFieldKey(args: {
  fields: ProgressField[];
  mode: "admin_sender" | "recipient";
  textValues: Record<string, string | boolean>;
  signatureImages: Record<string, string | undefined>;
  afterFieldKey?: string | null;
}): string | null {
  const ordered = orderedRequiredKeysForParty(args.fields, args.mode);
  const party = partyForProgress(args.mode);
  let startIdx = 0;
  if (args.afterFieldKey) {
    const ix = ordered.indexOf(args.afterFieldKey);
    startIdx = ix >= 0 ? ix + 1 : 0;
  }
  for (let i = startIdx; i < ordered.length; i++) {
    const fk = ordered[i];
    const f = args.fields.find((x) => x.field_key === fk);
    if (!f) continue;
    if (
      !isTemplateFieldCompleteForParty({
        f,
        party,
        textValues: args.textValues,
        signatureImages: args.signatureImages,
      })
    )
      return fk;
  }
  return null;
}

export function firstIncompleteRequiredFieldKey(args: {
  fields: ProgressField[];
  mode: "admin_sender" | "recipient";
  textValues: Record<string, string | boolean>;
  signatureImages: Record<string, string | undefined>;
}): string | null {
  return nextIncompleteRequiredFieldKey({ ...args, afterFieldKey: null });
}
