import {
  base64UrlEncode,
  decodeBase64Url,
  normalizeEmailAddress,
  normalizeMarketingSubject,
  normalizeSubject,
} from "@/lib/email-marketing/gmail/constants";
import { encodeMimeHeaderValue, normalizeEmailSubject } from "@/lib/email-marketing/gmail/mime-encoding";

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

export type ParsedGmailMessage = {
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  deliveredTo: string[];
  subject: string;
  normalizedSubject: string;
  bodyText: string;
  bodyHtml: string | null;
  snippet: string;
  messageIdHeader: string | null;
  inReplyToHeader: string | null;
  referencesHeader: string | null;
  internalDate: string | null;
  labelIds: string[];
  rawHeaders: Record<string, string>;
  attachments: Array<{
    gmailAttachmentId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
  }>;
};

function headerMap(headers: GmailHeader[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    const name = (h.name ?? "").trim();
    if (!name) continue;
    out[name.toLowerCase()] = h.value ?? "";
  }
  return out;
}

function parseAddressList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => normalizeEmailAddress(part))
    .filter(Boolean);
}

function parseFrom(raw: string | undefined): { email: string; name: string | null } {
  const value = (raw ?? "").trim();
  if (!value) return { email: "", name: null };
  const match = value.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.replace(/"/g, "").trim() || null,
      email: normalizeEmailAddress(match[2]),
    };
  }
  return { email: normalizeEmailAddress(value), name: null };
}

function decodePartBody(data: string | undefined): string {
  if (!data) return "";
  try {
    return decodeBase64Url(data);
  } catch {
    return "";
  }
}

function walkParts(part: GmailPart | undefined, acc: { text: string; html: string; attachments: ParsedGmailMessage["attachments"] }) {
  if (!part) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  const bodyData = part.body?.data;
  if (mime === "text/plain" && bodyData) acc.text += decodePartBody(bodyData);
  if (mime === "text/html" && bodyData) acc.html += decodePartBody(bodyData);
  if (part.body?.attachmentId) {
    acc.attachments.push({
      gmailAttachmentId: part.body.attachmentId,
      fileName: part.filename || "attachment",
      mimeType: part.mimeType || "application/octet-stream",
      sizeBytes: typeof part.body.size === "number" ? part.body.size : null,
    });
  }
  for (const child of part.parts ?? []) walkParts(child, acc);
}

export function parseGmailMessage(message: {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}): ParsedGmailMessage | null {
  const gmailMessageId = (message.id ?? "").trim();
  const gmailThreadId = (message.threadId ?? "").trim();
  if (!gmailMessageId || !gmailThreadId) return null;

  const headers = headerMap(message.payload?.headers);
  const fromParsed = parseFrom(headers.from);
  const subject = normalizeEmailSubject(headers.subject ?? "");
  const acc = { text: "", html: "", attachments: [] as ParsedGmailMessage["attachments"] };
  walkParts(message.payload, acc);

  const internalMs = message.internalDate ? Number.parseInt(message.internalDate, 10) : NaN;
  const internalDate = Number.isFinite(internalMs) ? new Date(internalMs).toISOString() : null;

  return {
    gmailMessageId,
    gmailThreadId,
    fromEmail: fromParsed.email,
    fromName: fromParsed.name,
    toEmails: parseAddressList(headers.to),
    ccEmails: parseAddressList(headers.cc),
    bccEmails: parseAddressList(headers.bcc),
    deliveredTo: parseAddressList(headers["delivered-to"]),
    subject,
    normalizedSubject: normalizeSubject(subject),
    bodyText: acc.text.trim(),
    bodyHtml: acc.html.trim() || null,
    snippet: (message.snippet ?? acc.text.slice(0, 180)).trim(),
    messageIdHeader: headers["message-id"] || null,
    inReplyToHeader: headers["in-reply-to"] || null,
    referencesHeader: headers.references || null,
    internalDate,
    labelIds: message.labelIds ?? [],
    rawHeaders: headers,
    attachments: acc.attachments,
  };
}

export function buildRawMimeMessage(input: {
  from: string;
  to: string[];
  cc?: string[];
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
}): string {
  const boundary = `saintly_${Date.now()}`;
  const hasAttachments = Boolean(input.attachments?.length);
  const rootContentType = hasAttachments
    ? `multipart/mixed; boundary="${boundary}"`
    : `multipart/alternative; boundary="${boundary}"`;

  const subjectLine = encodeMimeHeaderValue(normalizeMarketingSubject(input.subject));

  const headers = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    input.cc?.length ? `Cc: ${input.cc.join(", ")}` : "",
    `Reply-To: ${input.replyTo}`,
    `Subject: ${subjectLine}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : "",
    input.references ? `References: ${input.references}` : "",
    "MIME-Version: 1.0",
    `Content-Type: ${rootContentType}`,
  ]
    .filter(Boolean)
    .join("\r\n");

  const altBoundary = hasAttachments ? `alt_${boundary}` : boundary;
  const textB64 = Buffer.from(input.text, "utf8").toString("base64");
  const htmlB64 = Buffer.from(input.html, "utf8").toString("base64");
  const altParts = [
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    textB64,
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    htmlB64,
    `--${altBoundary}--`,
  ].join("\r\n");

  if (!hasAttachments) {
    return `${headers}\r\n\r\n${altParts}\r\n`;
  }

  const attachmentParts = (input.attachments ?? [])
    .map(
      (a) =>
        [
          `--${boundary}`,
          `Content-Type: ${a.contentType}; name="${a.filename}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${a.filename}"`,
          "",
          a.contentBase64,
        ].join("\r\n")
    )
    .join("\r\n");

  const mixedBody = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    altParts,
    attachmentParts,
    `--${boundary}--`,
  ].join("\r\n");

  return `${headers}\r\n\r\n${mixedBody}\r\n`;
}

export function encodeRawMime(raw: string): string {
  return base64UrlEncode(Buffer.from(raw, "utf8"));
}
