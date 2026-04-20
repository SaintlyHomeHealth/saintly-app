import { normalizeDialInputToE164, isValidE164 } from "@/lib/softphone/phone-number";

/** Parse `Display Name <email@host>` or bare email. */
export function extractDisplayNameFromFromHeader(fromRaw: string): { email: string; name?: string } {
  const t = String(fromRaw ?? "").trim();
  if (!t) return { email: "" };
  const m = t.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    const name = m[1].replace(/^["']|["']$/g, "").trim();
    const email = m[2].trim();
    return { email, name: name || undefined };
  }
  return { email: t };
}

const NANP_LIKE_GLOBAL =
  /\b(?:\+?1[\s.-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}\b|\b\d{10}\b/g;

/**
 * Conservative US-oriented phone extraction; returns unique E.164 values that validate.
 */
export function extractPhoneNumbersFromText(text: string | undefined | null): string[] {
  const s = String(text ?? "");
  if (!s.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(NANP_LIKE_GLOBAL.source, "g");
  while ((m = re.exec(s)) !== null) {
    const raw = m[0];
    const e164 = normalizeDialInputToE164(raw);
    if (e164 && isValidE164(e164) && !seen.has(e164)) {
      seen.add(e164);
      out.push(e164);
    }
  }
  return out;
}

/**
 * Very light patterns only (no NLP): "Patient: Jane Doe", "Name - John Smith", etc.
 */
export function maybeExtractSimplePersonNameFromSubjectOrBody(
  subject?: string | null,
  body?: string | null
): string | null {
  const blob = [subject, body].filter(Boolean).join("\n");
  if (!blob.trim()) return null;
  const patterns = [
    /(?:^|\n)\s*(?:patient|client|name|from|re|regarding)\s*[:#\-–—]\s*([A-Za-z][A-Za-z \t.'-]{0,79})/im,
    /(?:^|\n)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:needs|requested|referral|home\s+health)/i,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    if (m?.[1]) {
      const name = m[1].trim().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
      if (name.length >= 3 && name.length <= 100 && !/@/.test(name)) return name;
    }
  }
  return null;
}

export function resumeLikeAttachmentPresent(
  attachments: { filename?: string; contentType?: string }[] | undefined
): boolean {
  if (!attachments?.length) return false;
  for (const a of attachments) {
    const fn = (a.filename ?? "").toLowerCase();
    const ct = (a.contentType ?? "").toLowerCase();
    if (fn.endsWith(".pdf") || fn.endsWith(".doc") || fn.endsWith(".docx")) return true;
    if (ct.includes("pdf") || ct.includes("msword") || ct.includes("wordprocessingml")) return true;
  }
  return false;
}
