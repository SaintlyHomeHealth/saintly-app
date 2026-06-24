import "server-only";

import {
  getEmailMarketingProvider,
  getEmailMarketingSender,
  isEmailMarketingConfigured,
} from "@/lib/email-marketing/email-from";

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type SendMarketingEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
};

export type SendMarketingEmailResult =
  | { ok: true; provider: string; providerMessageId: string | null; gmailThreadId?: string | null }
  | { ok: false; error: string; provider: string };

export async function sendMarketingEmail(input: SendMarketingEmailInput): Promise<SendMarketingEmailResult> {
  const provider = getEmailMarketingProvider();
  if (!isEmailMarketingConfigured()) {
    return { ok: false, error: "Email sending is not configured.", provider };
  }

  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) {
    return { ok: false, error: "Invalid recipient email address.", provider };
  }
  const subject = input.subject.trim();
  if (!subject) {
    return { ok: false, error: "Subject is required.", provider };
  }

  switch (provider) {
    case "gmail":
      return sendViaGmail(input, to, subject);
    case "resend":
      return sendViaResend(input, to, subject);
    case "sendgrid":
      return sendViaSendGrid(input, to, subject);
    case "postmark":
      return sendViaPostmark(input, to, subject);
    case "smtp":
      return sendViaSmtp(input, to, subject);
    default:
      return { ok: false, error: `Unsupported EMAIL_PROVIDER: ${provider}`, provider };
  }
}

async function sendViaGmail(
  input: SendMarketingEmailInput,
  to: string,
  subject: string
): Promise<SendMarketingEmailResult> {
  const provider = "gmail";
  const { sendGmailMessage } = await import("@/lib/email-marketing/gmail/send");
  const result = await sendGmailMessage({
    to: [to],
    subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.contentType ?? "application/octet-stream",
      contentBase64: a.content,
    })),
  });
  if (!result.ok) return { ok: false, error: result.error, provider };
  return {
    ok: true,
    provider,
    providerMessageId: result.gmailMessageId,
    gmailThreadId: result.gmailThreadId,
  };
}

async function sendViaResend(
  input: SendMarketingEmailInput,
  to: string,
  subject: string
): Promise<SendMarketingEmailResult> {
  const provider = "resend";
  const key = process.env.RESEND_API_KEY!.trim();
  const { from, replyTo } = getEmailMarketingSender();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [to],
      subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body.slice(0, 500) || res.statusText || `Resend HTTP ${res.status}`, provider };
  }

  let providerMessageId: string | null = null;
  try {
    const json = (await res.json()) as { id?: string };
    providerMessageId = typeof json.id === "string" ? json.id : null;
  } catch {
    providerMessageId = null;
  }

  return { ok: true, provider, providerMessageId };
}

async function sendViaSendGrid(
  input: SendMarketingEmailInput,
  to: string,
  subject: string
): Promise<SendMarketingEmailResult> {
  const provider = "sendgrid";
  const key = process.env.SENDGRID_API_KEY!.trim();
  const { fromEmail, fromName, replyToEmail } = getEmailMarketingSender();

  const payload: Record<string, unknown> = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: fromName },
    reply_to: { email: replyToEmail },
    subject,
    content: [
      { type: "text/plain", value: input.text },
      { type: "text/html", value: input.html },
    ],
  };

  if (input.attachments?.length) {
    payload.attachments = input.attachments.map((a) => ({
      content: a.content,
      filename: a.filename,
      type: a.contentType ?? "application/octet-stream",
      disposition: "attachment",
    }));
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body.slice(0, 500) || res.statusText || `SendGrid HTTP ${res.status}`, provider };
  }

  const providerMessageId = res.headers.get("x-message-id");
  return { ok: true, provider, providerMessageId };
}

async function sendViaPostmark(
  input: SendMarketingEmailInput,
  to: string,
  subject: string
): Promise<SendMarketingEmailResult> {
  const provider = "postmark";
  const key = process.env.POSTMARK_API_KEY!.trim();
  const { from, replyTo } = getEmailMarketingSender();

  const payload: Record<string, unknown> = {
    From: from,
    ReplyTo: replyTo,
    To: to,
    Subject: subject,
    TextBody: input.text,
    HtmlBody: input.html,
  };

  if (input.attachments?.length) {
    payload.Attachments = input.attachments.map((a) => ({
      Name: a.filename,
      Content: a.content,
      ContentType: a.contentType ?? "application/octet-stream",
    }));
  }

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": key,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: body.slice(0, 500) || res.statusText || `Postmark HTTP ${res.status}`, provider };
  }

  let providerMessageId: string | null = null;
  try {
    const json = (await res.json()) as { MessageID?: string };
    providerMessageId = typeof json.MessageID === "string" ? json.MessageID : null;
  } catch {
    providerMessageId = null;
  }

  return { ok: true, provider, providerMessageId };
}

async function sendViaSmtp(
  input: SendMarketingEmailInput,
  to: string,
  subject: string
): Promise<SendMarketingEmailResult> {
  const provider = "smtp";
  const host = process.env.SMTP_HOST!.trim();
  const port = Number.parseInt(process.env.SMTP_PORT?.trim() || "587", 10);
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  const { from, replyTo } = getEmailMarketingSender();

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from,
      replyTo,
      to,
      subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        contentType: a.contentType,
      })),
    });
    const providerMessageId = typeof info.messageId === "string" ? info.messageId : null;
    return { ok: true, provider, providerMessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMTP send failed.";
    return { ok: false, error: message, provider };
  }
}
