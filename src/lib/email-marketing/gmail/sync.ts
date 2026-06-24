import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { getEmailMarketingSender } from "@/lib/email-marketing/email-from";
import { gmailApiFetch, getGmailAccessToken } from "@/lib/email-marketing/gmail/client";
import { assertSharedMailboxMessage } from "@/lib/email-marketing/gmail/send";
import { parseGmailMessage } from "@/lib/email-marketing/gmail/parse";
import type { EmailMailboxRow } from "@/lib/email-marketing/types";

type GmailListResponse = { messages?: Array<{ id?: string; threadId?: string }>; nextPageToken?: string };
type GmailHistoryResponse = {
  history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
  historyId?: string;
};

export type GmailSyncResult = {
  ok: true;
  syncedMessages: number;
  skippedPrivate: number;
  lastHistoryId: string | null;
};

async function upsertThreadFromMessage(mailbox: EmailMailboxRow, parsed: ReturnType<typeof parseGmailMessage>) {
  if (!parsed) return null;

  const participantEmails = Array.from(
    new Set([parsed.fromEmail, ...parsed.toEmails, ...parsed.ccEmails].filter(Boolean))
  );
  const participantNames = parsed.fromName ? [parsed.fromName] : [];

  const { data: existing } = await supabaseAdmin
    .from("email_threads")
    .select("id")
    .eq("gmail_thread_id", parsed.gmailThreadId)
    .maybeSingle();

  const threadPatch = {
    mailbox_id: mailbox.id,
    gmail_thread_id: parsed.gmailThreadId,
    subject: parsed.subject || "(No subject)",
    normalized_subject: parsed.normalizedSubject,
    last_message_at: parsed.internalDate,
    last_message_preview: parsed.snippet,
    participant_emails: participantEmails,
    participant_names: participantNames,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabaseAdmin.from("email_threads").update(threadPatch).eq("id", existing.id);
    return existing.id as string;
  }

  const { data: inserted } = await supabaseAdmin
    .from("email_threads")
    .insert(threadPatch)
    .select("id")
    .single();
  return inserted?.id as string | undefined;
}

async function upsertMessage(
  mailbox: EmailMailboxRow,
  threadId: string,
  parsed: NonNullable<ReturnType<typeof parseGmailMessage>>,
  direction: "inbound" | "outbound"
) {
  const mailboxEmail = mailbox.email_address.toLowerCase();
  const isOutbound = parsed.fromEmail === mailboxEmail || direction === "outbound";

  const { data: existing } = await supabaseAdmin
    .from("email_messages")
    .select("id")
    .eq("gmail_message_id", parsed.gmailMessageId)
    .maybeSingle();

  const row = {
    mailbox_id: mailbox.id,
    thread_id: threadId,
    gmail_message_id: parsed.gmailMessageId,
    gmail_thread_id: parsed.gmailThreadId,
    direction: isOutbound ? "outbound" : "inbound",
    from_email: parsed.fromEmail,
    from_name: parsed.fromName,
    to_emails: parsed.toEmails,
    cc_emails: parsed.ccEmails,
    bcc_emails: parsed.bccEmails,
    subject: parsed.subject,
    body_text: parsed.bodyText,
    body_html: parsed.bodyHtml,
    snippet: parsed.snippet,
    message_id_header: parsed.messageIdHeader,
    in_reply_to_header: parsed.inReplyToHeader,
    references_header: parsed.referencesHeader,
    gmail_internal_date: parsed.internalDate,
    has_attachments: parsed.attachments.length > 0,
    raw_headers: parsed.rawHeaders,
    status: isOutbound ? "sent" : "received",
    read_at: parsed.labelIds.includes("UNREAD") ? null : parsed.internalDate,
    updated_at: new Date().toISOString(),
  };

  let messageId = existing?.id as string | undefined;
  if (messageId) {
    await supabaseAdmin.from("email_messages").update(row).eq("id", messageId);
  } else {
    const { data: inserted } = await supabaseAdmin.from("email_messages").insert(row).select("id").single();
    messageId = inserted?.id as string | undefined;
  }

  if (messageId && parsed.attachments.length) {
    for (const att of parsed.attachments) {
      const { data: existingAtt } = await supabaseAdmin
        .from("email_attachments")
        .select("id")
        .eq("message_id", messageId)
        .eq("gmail_attachment_id", att.gmailAttachmentId)
        .maybeSingle();
      if (existingAtt?.id) continue;
      await supabaseAdmin.from("email_attachments").insert({
        message_id: messageId,
        gmail_attachment_id: att.gmailAttachmentId,
        file_name: att.fileName,
        mime_type: att.mimeType,
        size_bytes: att.sizeBytes,
      });
    }
  }
}

async function syncMessageById(
  mailbox: EmailMailboxRow,
  messageId: string,
  counters: { synced: number; skippedPrivate: number }
) {
  const { accessToken } = await getGmailAccessToken();
  const full = await gmailApiFetch<Record<string, unknown>>(
    `users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    { accessToken }
  );
  const parsed = parseGmailMessage(full as Parameters<typeof parseGmailMessage>[0]);
  if (!parsed) return;
  if (!assertSharedMailboxMessage(parsed)) {
    counters.skippedPrivate += 1;
    return;
  }
  const threadId = await upsertThreadFromMessage(mailbox, parsed);
  if (!threadId) return;
  await upsertMessage(mailbox, threadId, parsed, parsed.fromEmail === mailbox.email_address.toLowerCase() ? "outbound" : "inbound");
  counters.synced += 1;
}

export async function syncSharedMailbox(): Promise<GmailSyncResult> {
  const { accessToken, mailbox } = await getGmailAccessToken();
  const counters = { synced: 0, skippedPrivate: 0 };
  let lastHistoryId: string | null = mailbox.last_history_id ?? null;

  try {
    if (mailbox.last_history_id) {
      const history = await gmailApiFetch<GmailHistoryResponse>(
        `users/me/history?startHistoryId=${encodeURIComponent(mailbox.last_history_id)}&historyTypes=messageAdded`,
        { accessToken }
      );
      const ids = new Set<string>();
      for (const block of history.history ?? []) {
        for (const added of block.messagesAdded ?? []) {
          const id = added.message?.id?.trim();
          if (id) ids.add(id);
        }
      }
      for (const id of ids) {
        await syncMessageById(mailbox, id, counters);
      }
      if (history.historyId) lastHistoryId = history.historyId;
    } else {
      const list = await gmailApiFetch<GmailListResponse>(
        "users/me/messages?maxResults=50&q=newer_than:30d",
        { accessToken }
      );
      for (const msg of list.messages ?? []) {
        const id = msg.id?.trim();
        if (!id) continue;
        await syncMessageById(mailbox, id, counters);
      }
      const profile = await gmailApiFetch<{ historyId?: string }>("users/me/profile", { accessToken });
      if (profile.historyId) lastHistoryId = profile.historyId;
    }

    await supabaseAdmin
      .from("email_mailboxes")
      .update({
        last_sync_at: new Date().toISOString(),
        last_history_id: lastHistoryId,
        sync_error: null,
        status: "active",
      })
      .eq("id", mailbox.id);

    return { ok: true, syncedMessages: counters.synced, skippedPrivate: counters.skippedPrivate, lastHistoryId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail sync failed.";
    await supabaseAdmin
      .from("email_mailboxes")
      .update({ sync_error: message, status: "error", last_sync_at: new Date().toISOString() })
      .eq("id", mailbox.id);
    throw err;
  }
}

export async function importSentGmailMessage(input: {
  mailboxId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  sentByUserId: string;
  senderProfileId?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  toEmails: string[];
}) {
  let threadId: string | null = null;
  const { data: threadRow } = await supabaseAdmin
    .from("email_threads")
    .select("id")
    .eq("gmail_thread_id", input.gmailThreadId)
    .maybeSingle();
  threadId = threadRow?.id ?? null;

  if (!threadId) {
    const { data: insertedThread } = await supabaseAdmin
      .from("email_threads")
      .insert({
        mailbox_id: input.mailboxId,
        gmail_thread_id: input.gmailThreadId,
        subject: input.subject,
        normalized_subject: input.subject.replace(/^(re|fwd?):\s*/gi, "").trim().toLowerCase(),
        last_message_at: new Date().toISOString(),
        last_message_preview: input.bodyText.slice(0, 180),
        participant_emails: input.toEmails,
        created_by: input.sentByUserId,
      })
      .select("id")
      .single();
    threadId = insertedThread?.id ?? null;
  } else {
    await supabaseAdmin
      .from("email_threads")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: input.bodyText.slice(0, 180),
        subject: input.subject,
      })
      .eq("id", threadId);
  }

  const sender = getEmailMarketingSender();
  const { data: msgRow } = await supabaseAdmin
    .from("email_messages")
    .insert({
      mailbox_id: input.mailboxId,
      thread_id: threadId,
      gmail_message_id: input.gmailMessageId,
      gmail_thread_id: input.gmailThreadId,
      direction: "outbound",
      from_email: sender.fromEmail,
      from_name: sender.fromName,
      to_emails: input.toEmails,
      subject: input.subject,
      body_text: input.bodyText,
      body_html: input.bodyHtml,
      snippet: input.bodyText.slice(0, 180),
      gmail_internal_date: new Date().toISOString(),
      sent_by_user_id: input.sentByUserId,
      sender_profile_id: input.senderProfileId ?? null,
      status: "sent",
      provider: "gmail",
      read_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return { threadId, messageId: msgRow?.id as string | undefined };
}
