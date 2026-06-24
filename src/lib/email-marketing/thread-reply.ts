import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { getEmailMarketingProvider, getEmailMarketingSender } from "@/lib/email-marketing/email-from";
import { sendMarketingEmail, type EmailAttachment } from "@/lib/email-marketing/email-provider";
import { sendGmailReply, assertOutboundMailboxOnly } from "@/lib/email-marketing/gmail/send";
import { importSentGmailMessage } from "@/lib/email-marketing/gmail/sync";
import {
  buildLetterheadHtml,
  buildLetterheadText,
  resolveSenderProfile,
} from "@/lib/email-marketing/letterhead";
import type { EmailMarketingFlyerRow, EmailSenderProfileRow, EmailThreadRow } from "@/lib/email-marketing/types";

export type ThreadReplyInput = {
  thread: EmailThreadRow;
  toEmails: string[];
  body: string;
  senderProfile: EmailSenderProfileRow;
  customSender?: {
    name?: string;
    title?: string;
    phone?: string;
    email?: string;
  };
  flyer?: EmailMarketingFlyerRow | null;
  attachFlyer?: boolean;
  sentByUserId: string;
  showPrivateBusinessEmail?: boolean;
};

export async function sendThreadReply(input: ThreadReplyInput): Promise<
  | { ok: true; messageId: string; gmailMessageId?: string }
  | { ok: false; error: string }
> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Reply body is required." };
  if (!input.toEmails.length) return { ok: false, error: "Recipient is required." };

  assertOutboundMailboxOnly(input.toEmails);

  const senderProfile = resolveSenderProfile(input.senderProfile, input.customSender);
  const letterheadInput = {
    body,
    sender: senderProfile,
    showPrivateBusinessEmail: input.showPrivateBusinessEmail,
    flyer: input.flyer,
    attachFlyer: input.attachFlyer,
  };
  const html = buildLetterheadHtml(letterheadInput);
  const text = buildLetterheadText(letterheadInput);
  const provider = getEmailMarketingProvider();

  const { data: latestMessages } = await supabaseAdmin
    .from("email_messages")
    .select("message_id_header, references_header, subject")
    .eq("thread_id", input.thread.id)
    .order("gmail_internal_date", { ascending: false, nullsFirst: false })
    .limit(1);

  const latest = latestMessages?.[0];
  const subject = latest?.subject || input.thread.subject;

  let attachments: EmailAttachment[] | undefined;
  if (input.attachFlyer && input.flyer) {
    try {
      const res = await fetch(input.flyer.file_url);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        attachments = [
          {
            filename: input.flyer.file_name || "flyer.pdf",
            content: buffer.toString("base64"),
            contentType: input.flyer.file_type || "application/octet-stream",
          },
        ];
      }
    } catch {
      attachments = undefined;
    }
  }

  if (provider === "gmail" && input.thread.gmail_thread_id) {
    const gmailResult = await sendGmailReply({
      threadId: input.thread.id,
      gmailThreadId: input.thread.gmail_thread_id,
      to: input.toEmails,
      subject,
      bodyText: text,
      bodyHtml: html,
      latestMessageIdHeader: latest?.message_id_header ?? null,
      referencesHeader: latest?.references_header ?? null,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType ?? "application/octet-stream",
        contentBase64: a.content,
      })),
    });
    if (!gmailResult.ok) return { ok: false, error: gmailResult.error };

    const imported = await importSentGmailMessage({
      mailboxId: input.thread.mailbox_id,
      gmailMessageId: gmailResult.gmailMessageId,
      gmailThreadId: gmailResult.gmailThreadId,
      sentByUserId: input.sentByUserId,
      senderProfileId: input.senderProfile.id,
      subject,
      bodyText: body,
      bodyHtml: html,
      toEmails: input.toEmails,
    });

    if (imported.messageId) {
      await supabaseAdmin
        .from("email_messages")
        .update({
          sender_profile_id: input.senderProfile.id,
          custom_sender_name: input.customSender?.name ?? null,
          custom_sender_title: input.customSender?.title ?? null,
          custom_sender_phone: input.customSender?.phone ?? null,
          custom_sender_email: input.customSender?.email ?? null,
          flyer_id: input.flyer?.id ?? null,
          in_reply_to_header: latest?.message_id_header ?? null,
          references_header: [latest?.references_header, latest?.message_id_header].filter(Boolean).join(" ") || null,
        })
        .eq("id", imported.messageId);
    }

    return { ok: true, messageId: imported.messageId ?? gmailResult.gmailMessageId, gmailMessageId: gmailResult.gmailMessageId };
  }

  const sendResult = await sendMarketingEmail({
    to: input.toEmails[0]!,
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    text,
    html,
    attachments,
  });
  if (!sendResult.ok) return { ok: false, error: sendResult.error };

  const marketingSender = getEmailMarketingSender();
  const { data: msgRow } = await supabaseAdmin
    .from("email_messages")
    .insert({
      mailbox_id: input.thread.mailbox_id,
      thread_id: input.thread.id,
      gmail_thread_id: input.thread.gmail_thread_id,
      direction: "outbound",
      from_email: marketingSender.fromEmail,
      from_name: marketingSender.fromName,
      to_emails: input.toEmails,
      subject,
      body_text: body,
      body_html: html,
      snippet: body.slice(0, 180),
      gmail_internal_date: new Date().toISOString(),
      sent_by_user_id: input.sentByUserId,
      sender_profile_id: input.senderProfile.id,
      status: "sent",
      provider: sendResult.provider,
      read_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await supabaseAdmin
    .from("email_threads")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 180),
    })
    .eq("id", input.thread.id);

  return { ok: true, messageId: msgRow?.id as string };
}
