import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { getEmailMarketingSender } from "@/lib/email-marketing/email-from";
import { gmailApiFetch, getGmailAccessToken } from "@/lib/email-marketing/gmail/client";
import { normalizeMarketingSubject } from "@/lib/email-marketing/gmail/constants";
import { assertSharedMailboxMessage } from "@/lib/email-marketing/gmail/send";
import { parseGmailMessage, type ParsedGmailMessage } from "@/lib/email-marketing/gmail/parse";
import type { EmailMailboxRow } from "@/lib/email-marketing/types";

type GmailListResponse = { messages?: Array<{ id?: string; threadId?: string }>; nextPageToken?: string };
type GmailHistoryResponse = {
  history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
  historyId?: string;
};
type GmailThreadResponse = {
  id?: string;
  messages?: Array<Record<string, unknown>>;
};

export type GmailSyncResult = {
  ok: true;
  syncedMessages: number;
  updatedThreads: number;
  skipped: number;
  lastHistoryId: string | null;
};

async function recomputeThreadMetadata(threadId: string) {
  const { data: messages } = await supabaseAdmin
    .from("email_messages")
    .select("direction, gmail_internal_date, created_at")
    .eq("thread_id", threadId);

  if (!messages?.length) return;

  let latestAt: string | null = null;
  let latestDirection: "inbound" | "outbound" | null = null;
  let lastInboundAt: string | null = null;
  let hasInbound = false;

  for (const msg of messages) {
    const at = (msg.gmail_internal_date as string | null) ?? (msg.created_at as string);
    if (msg.direction === "inbound") {
      hasInbound = true;
      if (!lastInboundAt || at > lastInboundAt) lastInboundAt = at;
    }
    if (!latestAt || at > latestAt) {
      latestAt = at;
      latestDirection = msg.direction as "inbound" | "outbound";
    }
  }

  await supabaseAdmin
    .from("email_threads")
    .update({
      has_inbound: hasInbound,
      last_inbound_at: lastInboundAt,
      last_message_direction: latestDirection,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);
}

async function upsertThreadFromMessage(
  mailbox: EmailMailboxRow,
  parsed: ParsedGmailMessage,
  existingThread?: { id: string; participant_emails?: string[]; participant_names?: string[] } | null
) {
  const participantEmails = Array.from(
    new Set([
      ...(existingThread?.participant_emails ?? []),
      parsed.fromEmail,
      ...parsed.toEmails,
      ...parsed.ccEmails,
    ].filter(Boolean))
  );
  const participantNames = Array.from(
    new Set([...(existingThread?.participant_names ?? []), ...(parsed.fromName ? [parsed.fromName] : [])].filter(Boolean))
  );

  const mailboxEmail = mailbox.email_address.toLowerCase();
  const direction: "inbound" | "outbound" =
    parsed.fromEmail === mailboxEmail || parsed.labelIds.includes("SENT") ? "outbound" : "inbound";
  const isInbound = direction === "inbound";

  const threadPatch = {
    mailbox_id: mailbox.id,
    gmail_thread_id: parsed.gmailThreadId,
    subject: parsed.subject || "(No subject)",
    normalized_subject: parsed.normalizedSubject,
    last_message_at: parsed.internalDate,
    last_message_preview: parsed.snippet,
    participant_emails: participantEmails,
    participant_names: participantNames,
    last_message_direction: direction,
    updated_at: new Date().toISOString(),
  };

  let threadId = existingThread?.id;

  if (threadId) {
    const { data: current } = await supabaseAdmin
      .from("email_threads")
      .select("has_inbound, last_inbound_at")
      .eq("id", threadId)
      .maybeSingle();

    await supabaseAdmin
      .from("email_threads")
      .update({
        ...threadPatch,
        has_inbound: Boolean(current?.has_inbound) || isInbound,
        last_inbound_at:
          isInbound && parsed.internalDate
            ? parsed.internalDate
            : (current?.last_inbound_at as string | null) ?? null,
      })
      .eq("id", threadId);
  } else {
    const { data: inserted } = await supabaseAdmin
      .from("email_threads")
      .insert({
        ...threadPatch,
        has_inbound: isInbound,
        last_inbound_at: isInbound ? parsed.internalDate : null,
      })
      .select("id")
      .single();
    threadId = inserted?.id as string | undefined;
  }

  return threadId ?? null;
}

async function upsertMessage(
  mailbox: EmailMailboxRow,
  threadId: string,
  parsed: ParsedGmailMessage
): Promise<"inserted" | "updated" | "skipped"> {
  const mailboxEmail = mailbox.email_address.toLowerCase();
  const isOutbound = parsed.fromEmail === mailboxEmail || parsed.labelIds.includes("SENT");

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
  const action = messageId ? "updated" : "inserted";
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

  return messageId ? action : "skipped";
}

async function processParsedMessage(
  mailbox: EmailMailboxRow,
  parsed: ParsedGmailMessage | null,
  counters: { synced: number; skipped: number; touchedThreads: Set<string> }
) {
  if (!parsed) return;
  if (!assertSharedMailboxMessage(parsed)) {
    counters.skipped += 1;
    return;
  }

  const { data: existingThread } = await supabaseAdmin
    .from("email_threads")
    .select("id, participant_emails, participant_names")
    .eq("gmail_thread_id", parsed.gmailThreadId)
    .maybeSingle();

  const threadId = await upsertThreadFromMessage(mailbox, parsed, existingThread);
  if (!threadId) return;

  const result = await upsertMessage(mailbox, threadId, parsed);
  if (result !== "skipped") {
    counters.synced += 1;
    counters.touchedThreads.add(threadId);
    await recomputeThreadMetadata(threadId);
  }
}

async function syncMessageById(
  mailbox: EmailMailboxRow,
  messageId: string,
  accessToken: string,
  counters: { synced: number; skipped: number; touchedThreads: Set<string> }
) {
  const full = await gmailApiFetch<Record<string, unknown>>(
    `users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    { accessToken }
  );
  const parsed = parseGmailMessage(full as Parameters<typeof parseGmailMessage>[0]);
  await processParsedMessage(mailbox, parsed, counters);
}

async function syncGmailThreadById(
  mailbox: EmailMailboxRow,
  gmailThreadId: string,
  accessToken: string,
  counters: { synced: number; skipped: number; touchedThreads: Set<string>; updatedThreads: Set<string> }
) {
  const thread = await gmailApiFetch<GmailThreadResponse>(
    `users/me/threads/${encodeURIComponent(gmailThreadId)}?format=full`,
    { accessToken }
  );
  const before = counters.synced;
  for (const msg of thread.messages ?? []) {
    const parsed = parseGmailMessage(msg as Parameters<typeof parseGmailMessage>[0]);
    await processParsedMessage(mailbox, parsed, counters);
  }
  if (counters.synced > before || (thread.messages?.length ?? 0) > 0) {
    counters.updatedThreads.add(gmailThreadId);
  }
}

async function listInboxMessageIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({
      labelIds: "INBOX",
      maxResults: "100",
      q: "newer_than:90d",
    });
    if (pageToken) qs.set("pageToken", pageToken);
    const list = await gmailApiFetch<GmailListResponse>(`users/me/messages?${qs.toString()}`, { accessToken });
    for (const msg of list.messages ?? []) {
      const id = msg.id?.trim();
      if (id) ids.push(id);
    }
    pageToken = list.nextPageToken;
  } while (pageToken && ids.length < 300);
  return ids;
}

export async function syncSharedMailbox(): Promise<GmailSyncResult> {
  const { accessToken, mailbox } = await getGmailAccessToken();
  const counters = {
    synced: 0,
    skipped: 0,
    touchedThreads: new Set<string>(),
    updatedThreads: new Set<string>(),
  };
  let lastHistoryId: string | null = mailbox.last_history_id ?? null;

  try {
    const messageIds = new Set<string>();

    if (mailbox.last_history_id) {
      const history = await gmailApiFetch<GmailHistoryResponse>(
        `users/me/history?startHistoryId=${encodeURIComponent(mailbox.last_history_id)}&historyTypes=messageAdded`,
        { accessToken }
      );
      for (const block of history.history ?? []) {
        for (const added of block.messagesAdded ?? []) {
          const id = added.message?.id?.trim();
          if (id) messageIds.add(id);
        }
      }
      if (history.historyId) lastHistoryId = history.historyId;
    }

    for (const id of await listInboxMessageIds(accessToken)) {
      messageIds.add(id);
    }

    for (const id of messageIds) {
      await syncMessageById(mailbox, id, accessToken, counters);
    }

    const { data: trackedThreads } = await supabaseAdmin
      .from("email_threads")
      .select("gmail_thread_id")
      .eq("mailbox_id", mailbox.id)
      .not("gmail_thread_id", "is", null);

    for (const row of trackedThreads ?? []) {
      const gmailThreadId = (row.gmail_thread_id as string | null)?.trim();
      if (!gmailThreadId) continue;
      await syncGmailThreadById(mailbox, gmailThreadId, accessToken, counters);
    }

    if (!mailbox.last_history_id) {
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

    return {
      ok: true,
      syncedMessages: counters.synced,
      updatedThreads: counters.updatedThreads.size,
      skipped: counters.skipped,
      lastHistoryId,
    };
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
  const subject = normalizeMarketingSubject(input.subject);
  let threadId: string | null = null;
  const { data: threadRow } = await supabaseAdmin
    .from("email_threads")
    .select("id, has_inbound")
    .eq("gmail_thread_id", input.gmailThreadId)
    .maybeSingle();
  threadId = threadRow?.id ?? null;

  const now = new Date().toISOString();
  if (!threadId) {
    const { data: insertedThread } = await supabaseAdmin
      .from("email_threads")
      .insert({
        mailbox_id: input.mailboxId,
        gmail_thread_id: input.gmailThreadId,
        subject,
        normalized_subject: subject.replace(/^(re|fwd?):\s*/gi, "").trim().toLowerCase(),
        last_message_at: now,
        last_message_preview: input.bodyText.slice(0, 180),
        participant_emails: input.toEmails,
        created_by: input.sentByUserId,
        has_inbound: false,
        last_message_direction: "outbound",
      })
      .select("id")
      .single();
    threadId = insertedThread?.id ?? null;
  } else {
    await supabaseAdmin
      .from("email_threads")
      .update({
        last_message_at: now,
        last_message_preview: input.bodyText.slice(0, 180),
        subject,
        last_message_direction: "outbound",
      })
      .eq("id", threadId);
  }

  const sender = getEmailMarketingSender();
  const { data: existingMsg } = await supabaseAdmin
    .from("email_messages")
    .select("id")
    .eq("gmail_message_id", input.gmailMessageId)
    .maybeSingle();

  if (existingMsg?.id) {
    return { threadId, messageId: existingMsg.id as string };
  }

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
      subject,
      body_text: input.bodyText,
      body_html: input.bodyHtml,
      snippet: input.bodyText.slice(0, 180),
      gmail_internal_date: now,
      sent_by_user_id: input.sentByUserId,
      sender_profile_id: input.senderProfileId ?? null,
      status: "sent",
      provider: "gmail",
      read_at: now,
    })
    .select("id")
    .single();

  if (threadId) await recomputeThreadMetadata(threadId);

  return { threadId, messageId: msgRow?.id as string | undefined };
}
