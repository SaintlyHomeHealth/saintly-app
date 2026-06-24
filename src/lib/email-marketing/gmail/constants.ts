import "server-only";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

export const PRIVATE_BUSINESS_EMAIL = "info@saintlyhomehealth.com";
export const CRM_SHARED_MAILBOX_EMAIL = "admin@saintlyhomehealth.com";

export function normalizeEmailAddress(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toLowerCase();
  const match = v.match(/<([^>]+)>/);
  return (match?.[1] ?? v).trim();
}

export function isPrivateBusinessEmail(email: string | null | undefined): boolean {
  return normalizeEmailAddress(email) === PRIVATE_BUSINESS_EMAIL;
}

export function messageTouchesPrivateInbox(headers: {
  from?: string;
  to?: string[];
  cc?: string[];
}): boolean {
  if (isPrivateBusinessEmail(headers.from)) return true;
  for (const e of [...(headers.to ?? []), ...(headers.cc ?? [])]) {
    if (isPrivateBusinessEmail(e)) return true;
  }
  return false;
}

export function messageBelongsToSharedMailbox(
  mailboxEmail: string,
  headers: { from?: string; to?: string[]; cc?: string[]; bcc?: string[]; deliveredTo?: string[] }
): boolean {
  const mailbox = normalizeEmailAddress(mailboxEmail);
  const all = [
    headers.from,
    ...(headers.to ?? []),
    ...(headers.cc ?? []),
    ...(headers.bcc ?? []),
    ...(headers.deliveredTo ?? []),
  ]
    .map(normalizeEmailAddress)
    .filter(Boolean);
  return all.includes(mailbox);
}

export function normalizeSubject(subject: string): string {
  return subject.replace(/^(re|fwd?):\s*/gi, "").trim().toLowerCase();
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^re:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Marketing/composer subjects: plain ASCII hyphen, no em dash. */
export function normalizeMarketingSubject(subject: string): string {
  return subject
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, " - ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf8");
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() ?? "";
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured(): boolean {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return Boolean(clientId && clientSecret && redirectUri);
}
