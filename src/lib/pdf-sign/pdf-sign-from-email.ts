import "server-only";

const FALLBACK_ALLOWED = [
  "info@saintlyhomehealth.com",
  "onboarding@saintlyhomehealth.com",
  "paul@saintlyhomehealth.com",
];

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

/** Emails operators may choose as Reply-To until verified as Resend senders. */
export function pdfSignAllowedFromEmailList(): string[] {
  const fromEnv = parseEmailList(process.env.PDF_SIGN_ALLOWED_FROM_EMAILS);
  if (fromEnv.length > 0) return fromEnv;
  return FALLBACK_ALLOWED.slice();
}

export function pdfSignDefaultFromEmail(): string {
  const d = process.env.PDF_SIGN_DEFAULT_FROM_EMAIL?.trim().toLowerCase();
  const allowed = new Set(pdfSignAllowedFromEmailList());
  if (d && allowed.has(d)) return d;
  return allowed.has(FALLBACK_ALLOWED[0])
    ? FALLBACK_ALLOWED[0]
    : [...allowed][0] || FALLBACK_ALLOWED[0];
}

/** Normalize free-text sender pick to an allow-listed address or null if invalid / empty. */
export function sanitizePdfSignSelectedFromEmail(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!trimmed || !trimmed.includes("@")) return null;
  const allowed = new Set(pdfSignAllowedFromEmailList());
  return allowed.has(trimmed) ? trimmed : null;
}

/** Extract bare email from `Name <email@x.com>` or plain `email@x.com`. */
export function pdfSignBareEmail(fromHeader: string): string | null {
  const s = fromHeader.trim();
  const angled = /<([^>]+)>/.exec(s);
  const inner = angled ? angled[1]!.trim() : s.trim();
  const lower = inner.toLowerCase();
  return lower.includes("@") ? lower : null;
}

/**
 * Resolved outbound headers for Saintly PDF sign mail.
 * `fromHeader` must be `RESEND_FROM` (verified). Selected address is Reply-To when it differs.
 */
export function pdfSignOutboundHeaders(input: { fromHeaderResend: string; selectedReplyToEmail: string | null }): {
  from: string;
  reply_to?: string[];
} {
  const fromHeader = input.fromHeaderResend.trim();
  const verifiedBare = pdfSignBareEmail(fromHeader);
  const pick = sanitizePdfSignSelectedFromEmail(input.selectedReplyToEmail) ?? pdfSignDefaultFromEmail();
  const replyBare = pick.trim().toLowerCase();
  if (verifiedBare && replyBare && replyBare !== verifiedBare) {
    return { from: fromHeader, reply_to: [replyBare] };
  }
  return { from: fromHeader };
}
