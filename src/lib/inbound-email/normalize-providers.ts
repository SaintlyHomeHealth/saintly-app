import { extractDisplayNameFromFromHeader } from "./extract";
import type { InboundEmailNormalized } from "./types";

function isoNow(): string {
  return new Date().toISOString();
}

function asStringArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x.trim() : String(x ?? ""))).filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function firstString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Our default / manual JSON format (`canonicalInboundEmailSchema`). */
export function normalizeDefaultInboundEmail(
  body: Record<string, unknown>,
  providerLabel = "default"
): InboundEmailNormalized {
  const fromRaw = firstString(body.fromEmail) ?? "";
  const { email: fromEmail, name: fromParsedName } = extractDisplayNameFromFromHeader(fromRaw);
  const fromName = firstString(body.fromName) ?? fromParsedName;
  const toEmails = asStringArray(body.toEmails);
  const cc = asStringArray(body.ccEmails);
  const receivedAt = firstString(body.receivedAt) ?? isoNow();
  return {
    provider: firstString(body.provider) ?? providerLabel,
    messageId: firstString(body.messageId),
    fromEmail,
    fromName,
    toEmails,
    ccEmails: cc.length ? cc : undefined,
    subject: firstString(body.subject),
    textBody: firstString(body.textBody),
    htmlBody: firstString(body.htmlBody),
    receivedAt,
    attachments: Array.isArray(body.attachments) ? (body.attachments as InboundEmailNormalized["attachments"]) : undefined,
    raw: body,
  };
}

/**
 * Resend inbound-style webhook (flexible keys).
 * @see https://resend.com/docs/dashboard/receiving/introduction
 */
export function normalizeResendInboundEmail(raw: Record<string, unknown>): InboundEmailNormalized {
  const data = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
  const fromRaw = firstString(data.from) ?? "";
  const { email: fromEmail, name: fromName } = extractDisplayNameFromFromHeader(fromRaw);
  const toEmails = asStringArray(data.to ?? data.recipients);
  const ccEmails = asStringArray(data.cc);
  const subject = firstString(data.subject);
  const textBody = firstString(data.text ?? data.text_body ?? data.plaintext);
  const htmlBody = firstString(data.html ?? data.html_body);
  const messageId =
    firstString(data.email_id) ?? firstString(data.id) ?? firstString(data.message_id) ?? firstString(raw.id);
  const receivedAt = firstString(data.created_at as string) ?? firstString(raw.created_at as string) ?? isoNow();
  const atts: InboundEmailNormalized["attachments"] = [];
  if (Array.isArray(data.attachments)) {
    for (const a of data.attachments) {
      if (!a || typeof a !== "object") continue;
      const o = a as Record<string, unknown>;
      atts.push({
        filename: firstString(o.filename ?? o.name),
        contentType: firstString(o.content_type ?? o.contentType),
        size: typeof o.size === "number" ? o.size : undefined,
        url: firstString(o.download_url ?? o.url),
        contentId: firstString(o.id),
      });
    }
  }
  return {
    provider: "resend",
    messageId,
    fromEmail,
    fromName,
    toEmails,
    ccEmails: ccEmails.length ? ccEmails : undefined,
    subject,
    textBody,
    htmlBody,
    receivedAt,
    attachments: atts.length ? atts : undefined,
    raw,
  };
}

/**
 * SendGrid Inbound Parse (multipart fields or JSON mirror).
 */
export function normalizeSendgridInboundEmail(raw: Record<string, unknown>): InboundEmailNormalized {
  const fromRaw = firstString(raw.from) ?? "";
  const { email: fromEmail, name: fromName } = extractDisplayNameFromFromHeader(fromRaw);
  const toRaw = firstString(raw.to) ?? "";
  const toEmails = toRaw
    ? toRaw.split(",").map((x) => x.trim()).filter(Boolean)
    : asStringArray(raw.recipients);
  const subject = firstString(raw.subject);
  const textBody = firstString(raw.text ?? raw.plain);
  const htmlBody = firstString(raw.html);
  let messageId: string | undefined;
  const headers = firstString(raw.headers);
  if (headers) {
    const m = headers.match(/^message-id:\s*(.+)$/im);
    if (m?.[1]) messageId = m[1].trim().replace(/^<|>$/g, "");
  }
  messageId = messageId ?? firstString(raw["message-id"]) ?? firstString(raw.messageId);
  const envelope = raw.envelope;
  if (typeof envelope === "string" && envelope.trim()) {
    try {
      const env = JSON.parse(envelope) as { to?: string[] };
      if (Array.isArray(env.to) && env.to.length && !toEmails.length) {
        toEmails.push(...env.to.map((x) => String(x).trim()).filter(Boolean));
      }
    } catch {
      /* ignore */
    }
  }
  const atts: InboundEmailNormalized["attachments"] = [];
  const n = Number(raw.attachments);
  if (Number.isFinite(n) && n > 0) {
    for (let i = 1; i <= n; i++) {
      const info = raw[`attachment${i + 1}`] ?? raw[`attachment-info`];
      if (typeof info === "string") {
        try {
          const j = JSON.parse(info) as Record<string, string>;
          atts.push({ filename: j.filename ?? j.name, contentType: j.type });
        } catch {
          atts.push({ filename: `attachment${i}` });
        }
      }
    }
  }
  return {
    provider: "sendgrid",
    messageId,
    fromEmail,
    fromName,
    toEmails,
    subject,
    textBody,
    htmlBody,
    receivedAt: isoNow(),
    attachments: atts.length ? atts : undefined,
    raw,
  };
}

/**
 * Mailgun Routes inbound (typical form fields).
 */
export function normalizeMailgunInboundEmail(raw: Record<string, unknown>): InboundEmailNormalized {
  const fromRaw = firstString(raw.sender) ?? firstString(raw.from) ?? "";
  const { email: fromEmail, name: fromName } = extractDisplayNameFromFromHeader(fromRaw);
  const recipient = firstString(raw.recipient) ?? "";
  const toEmails = recipient ? [recipient] : asStringArray(raw.To ?? raw.to);
  const subject = firstString(raw.subject);
  const textBody = firstString(raw["body-plain"] ?? raw["stripped-text"] ?? raw.text);
  const htmlBody = firstString(raw["body-html"] ?? raw["stripped-html"]);
  const messageId = firstString(raw["Message-Id"] ?? raw["message-id"]);
  return {
    provider: "mailgun",
    messageId,
    fromEmail,
    fromName,
    toEmails,
    subject,
    textBody,
    htmlBody,
    receivedAt: isoNow(),
    raw,
  };
}
