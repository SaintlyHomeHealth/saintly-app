import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { getEmailMarketingSender } from "@/lib/email-marketing/email-from";
import { gmailApiFetch, getGmailAccessToken } from "@/lib/email-marketing/gmail/client";
import {
  CRM_SHARED_MAILBOX_EMAIL,
  messageBelongsToSharedMailbox,
  messageTouchesPrivateInbox,
  replySubject,
} from "@/lib/email-marketing/gmail/constants";
import { buildRawMimeMessage, encodeRawMime } from "@/lib/email-marketing/gmail/parse";

export type GmailSendInput = {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  gmailThreadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
};

export type GmailSendResult =
  | { ok: true; gmailMessageId: string; gmailThreadId: string }
  | { ok: false; error: string };

export async function sendGmailMessage(input: GmailSendInput): Promise<GmailSendResult> {
  try {
    const { accessToken } = await getGmailAccessToken();
    const { from, replyTo } = getEmailMarketingSender();
    const to = input.to.map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!to.length) return { ok: false, error: "Recipient is required." };

    const raw = buildRawMimeMessage({
      from,
      to,
      cc: input.cc,
      replyTo,
      subject: input.subject.trim(),
      text: input.text,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references,
      attachments: input.attachments,
    });

    const payload: Record<string, string> = { raw: encodeRawMime(raw) };
    if (input.gmailThreadId) payload.threadId = input.gmailThreadId;

    const json = await gmailApiFetch<{ id?: string; threadId?: string }>("users/me/messages/send", {
      method: "POST",
      accessToken,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const gmailMessageId = (json.id ?? "").trim();
    const gmailThreadId = (json.threadId ?? input.gmailThreadId ?? "").trim();
    if (!gmailMessageId || !gmailThreadId) {
      return { ok: false, error: "Gmail send succeeded but returned incomplete ids." };
    }
    return { ok: true, gmailMessageId, gmailThreadId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gmail send failed." };
  }
}

export async function sendGmailReply(input: {
  threadId: string;
  gmailThreadId: string;
  to: string[];
  bodyText: string;
  bodyHtml: string;
  subject: string;
  latestMessageIdHeader?: string | null;
  referencesHeader?: string | null;
  attachments?: GmailSendInput["attachments"];
}): Promise<GmailSendResult> {
  const refs = [input.referencesHeader, input.latestMessageIdHeader].filter(Boolean).join(" ").trim() || null;
  return sendGmailMessage({
    to: input.to,
    subject: replySubject(input.subject),
    text: input.bodyText,
    html: input.bodyHtml,
    gmailThreadId: input.gmailThreadId,
    inReplyTo: input.latestMessageIdHeader ?? null,
    references: refs,
    attachments: input.attachments,
  });
}

export async function fetchGmailAttachment(input: {
  gmailMessageId: string;
  gmailAttachmentId: string;
}): Promise<{ data: Buffer; size: number } | null> {
  try {
    const { accessToken } = await getGmailAccessToken();
    const json = await gmailApiFetch<{ data?: string; size?: number }>(
      `users/me/messages/${encodeURIComponent(input.gmailMessageId)}/attachments/${encodeURIComponent(input.gmailAttachmentId)}`,
      { accessToken }
    );
    if (!json.data) return null;
    const padded = json.data.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const buf = Buffer.from(padded + "=".repeat(padLen), "base64");
    return { data: buf, size: json.size ?? buf.length };
  } catch {
    return null;
  }
}

export function assertOutboundMailboxOnly(recipientEmails: string[]): void {
  for (const email of recipientEmails) {
    if (email.trim().toLowerCase() === "info@saintlyhomehealth.com") {
      throw new Error("Cannot send CRM shared inbox mail to the private info@ mailbox.");
    }
  }
}

export function assertSharedMailboxMessage(parsed: {
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  deliveredTo: string[];
}): boolean {
  if (messageTouchesPrivateInbox({ from: parsed.fromEmail, to: parsed.toEmails, cc: parsed.ccEmails })) {
    return false;
  }
  return messageBelongsToSharedMailbox(CRM_SHARED_MAILBOX_EMAIL, {
    from: parsed.fromEmail,
    to: parsed.toEmails,
    cc: parsed.ccEmails,
    deliveredTo: parsed.deliveredTo,
  });
}

export async function markGmailMessageRead(gmailMessageId: string, read: boolean): Promise<void> {
  const { accessToken } = await getGmailAccessToken();
  await gmailApiFetch(`users/me/messages/${encodeURIComponent(gmailMessageId)}/modify`, {
    method: "POST",
    accessToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      removeLabelIds: read ? ["UNREAD"] : [],
      addLabelIds: read ? [] : ["UNREAD"],
    }),
  });
}

export async function updateMailboxSyncState(input: {
  mailboxId: string;
  lastHistoryId?: string | null;
  syncError?: string | null;
  status?: string;
}) {
  await supabaseAdmin
    .from("email_mailboxes")
    .update({
      last_sync_at: new Date().toISOString(),
      last_history_id: input.lastHistoryId ?? undefined,
      sync_error: input.syncError ?? null,
      status: input.status ?? "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.mailboxId);
}
