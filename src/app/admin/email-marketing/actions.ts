"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { getEmailMarketingProvider, getEmailMarketingSender } from "@/lib/email-marketing/email-from";
import { sendMarketingEmail } from "@/lib/email-marketing/email-provider";
import { getSharedMailbox } from "@/lib/email-marketing/gmail/client";
import { normalizeMarketingSubject } from "@/lib/email-marketing/gmail/constants";
import { importSentGmailMessage } from "@/lib/email-marketing/gmail/sync";
import {
  applyTemplateVariables,
  buildLetterheadHtml,
  buildLetterheadText,
  resolveSenderProfile,
} from "@/lib/email-marketing/letterhead";
import { canViewPrivateBusinessEmail } from "@/lib/email-marketing/permissions";
import { requireEmailMarketingStaff } from "@/lib/email-marketing/require-email-marketing-staff";
import {
  EMAIL_MARKETING_FLYERS_BUCKET,
  type EmailMarketingFlyerRow,
  type EmailSenderProfileRow,
} from "@/lib/email-marketing/types";
import { isAdminOrHigher } from "@/lib/staff-profile";

const PAGE = "/admin/email-marketing";
const MAX_BODY = 20000;
const MAX_SUBJECT = 300;
const MAX_FLYER_BYTES = 15 * 1024 * 1024;

export type EmailMarketingActionResult =
  | { ok: true; messageId?: string; id?: string }
  | { ok: false; error: string };

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBool(formData: FormData, key: string): boolean {
  return readString(formData, key) === "1" || readString(formData, key) === "true";
}

function sanitizeFileName(name: string): string {
  return (name || "flyer").replace(/[^\w.\-()+ ]+/g, "-").replace(/\s+/g, "-").slice(0, 180);
}

async function loadSenderProfile(profileId: string): Promise<EmailSenderProfileRow | null> {
  const { data } = await supabaseAdmin
    .from("email_sender_profiles")
    .select("*")
    .eq("id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as EmailSenderProfileRow | null) ?? null;
}

async function loadFlyer(flyerId: string | null): Promise<EmailMarketingFlyerRow | null> {
  if (!flyerId) return null;
  const { data } = await supabaseAdmin
    .from("email_marketing_flyers")
    .select("*")
    .eq("id", flyerId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as EmailMarketingFlyerRow | null) ?? null;
}

async function fetchFlyerAttachment(
  flyer: EmailMarketingFlyerRow
): Promise<{ filename: string; content: string; contentType: string } | null> {
  try {
    const res = await fetch(flyer.file_url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      filename: flyer.file_name || "flyer.pdf",
      content: buffer.toString("base64"),
      contentType: flyer.file_type || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

function composePayload(formData: FormData, staffUserId: string) {
  const recipientName = readString(formData, "recipient_name");
  const recipientEmail = readString(formData, "recipient_email").toLowerCase();
  const organizationName = readString(formData, "organization_name");
  const subject = normalizeMarketingSubject(readString(formData, "subject").slice(0, MAX_SUBJECT));
  const bodyRaw = readString(formData, "body").slice(0, MAX_BODY);
  const templateId = readString(formData, "template_id") || null;
  const senderProfileId = readString(formData, "sender_profile_id") || null;
  const flyerId = readString(formData, "flyer_id") || null;
  const attachFlyer = readBool(formData, "attach_flyer");
  const messageId = readString(formData, "message_id") || null;

  const body = applyTemplateVariables(bodyRaw, {
    recipient_name: recipientName,
    organization_name: organizationName,
  });

  return {
    recipientName,
    recipientEmail,
    organizationName,
    subject,
    body,
    templateId,
    senderProfileId,
    flyerId,
    attachFlyer,
    messageId,
    customSenderName: readString(formData, "custom_sender_name"),
    customSenderTitle: readString(formData, "custom_sender_title"),
    customSenderPhone: readString(formData, "custom_sender_phone"),
    customSenderEmail: readString(formData, "custom_sender_email"),
    sentByUserId: staffUserId,
  };
}

export async function saveEmailMarketingDraftAction(formData: FormData): Promise<EmailMarketingActionResult> {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  const payload = composePayload(formData, gate.staff.user_id);
  if (!payload.recipientEmail.includes("@")) {
    return { ok: false, error: "Recipient email is required." };
  }

  const sender = getEmailMarketingSender();
  const row = {
    sent_by_user_id: gate.staff.user_id,
    sender_profile_id: payload.senderProfileId,
    custom_sender_name: payload.customSenderName || null,
    custom_sender_title: payload.customSenderTitle || null,
    custom_sender_phone: payload.customSenderPhone || null,
    custom_sender_email: payload.customSenderEmail || null,
    from_email: sender.fromEmail,
    reply_to_email: sender.replyToEmail,
    recipient_email: payload.recipientEmail,
    recipient_name: payload.recipientName || null,
    organization_name: payload.organizationName || null,
    subject: payload.subject || "(Draft)",
    body: payload.body,
    template_id: payload.templateId,
    flyer_id: payload.flyerId,
    attach_flyer: payload.attachFlyer,
    status: "draft" as const,
  };

  if (payload.messageId) {
    const { error } = await supabaseAdmin
      .from("email_marketing_messages")
      .update(row)
      .eq("id", payload.messageId)
      .eq("sent_by_user_id", gate.staff.user_id)
      .eq("status", "draft");
    if (error) return { ok: false, error: error.message };
    revalidatePath(PAGE);
    return { ok: true, id: payload.messageId };
  }

  const { data, error } = await supabaseAdmin
    .from("email_marketing_messages")
    .insert(row)
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, error: error?.message || "Could not save draft." };
  revalidatePath(PAGE);
  return { ok: true, id: data.id as string };
}

export async function sendEmailMarketingMessageAction(formData: FormData): Promise<EmailMarketingActionResult> {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  const payload = composePayload(formData, gate.staff.user_id);
  if (!payload.recipientEmail.includes("@")) {
    return { ok: false, error: "Valid recipient email is required." };
  }
  if (!payload.subject) return { ok: false, error: "Subject is required." };
  if (!payload.body.trim()) return { ok: false, error: "Message body is required." };
  if (!payload.senderProfileId) return { ok: false, error: "Sender profile is required." };

  const profile = await loadSenderProfile(payload.senderProfileId);
  if (!profile) return { ok: false, error: "Sender profile not found." };

  const flyer = await loadFlyer(payload.flyerId);
  const senderProfile = resolveSenderProfile(profile, {
    name: payload.customSenderName,
    title: payload.customSenderTitle,
    phone: payload.customSenderPhone,
    email: payload.customSenderEmail,
  });
  const showPrivate = canViewPrivateBusinessEmail(gate.staff);
  const letterheadInput = {
    body: payload.body,
    sender: senderProfile,
    showPrivateBusinessEmail: showPrivate,
    flyer,
    attachFlyer: payload.attachFlyer,
  };
  const html = buildLetterheadHtml(letterheadInput);
  const text = buildLetterheadText(letterheadInput);

  const marketingSender = getEmailMarketingSender();
  const provider = getEmailMarketingProvider();

  let messageId = payload.messageId;
  const baseRow = {
    sent_by_user_id: gate.staff.user_id,
    sender_profile_id: payload.senderProfileId,
    custom_sender_name: payload.customSenderName || null,
    custom_sender_title: payload.customSenderTitle || null,
    custom_sender_phone: payload.customSenderPhone || null,
    custom_sender_email: payload.customSenderEmail || null,
    from_email: marketingSender.fromEmail,
    reply_to_email: marketingSender.replyToEmail,
    recipient_email: payload.recipientEmail,
    recipient_name: payload.recipientName || null,
    organization_name: payload.organizationName || null,
    subject: payload.subject,
    body: payload.body,
    template_id: payload.templateId,
    flyer_id: payload.flyerId,
    attach_flyer: payload.attachFlyer,
    status: "sending" as const,
    provider,
    error_message: null,
  };

  if (messageId) {
    await supabaseAdmin
      .from("email_marketing_messages")
      .update(baseRow)
      .eq("id", messageId)
      .eq("sent_by_user_id", gate.staff.user_id);
  } else {
    const { data, error } = await supabaseAdmin
      .from("email_marketing_messages")
      .insert(baseRow)
      .select("id")
      .single();
    if (error || !data?.id) return { ok: false, error: error?.message || "Could not create message record." };
    messageId = data.id as string;
  }

  const flyerAttachment = payload.attachFlyer && flyer ? await fetchFlyerAttachment(flyer) : null;
  const attachments = flyerAttachment ? [flyerAttachment] : undefined;

  const sendResult = await sendMarketingEmail({
    to: payload.recipientEmail,
    subject: payload.subject,
    text,
    html,
      attachments,
  });

  if (!sendResult.ok) {
    await supabaseAdmin
      .from("email_marketing_messages")
      .update({
        status: "failed",
        error_message: sendResult.error,
        provider: sendResult.provider,
      })
      .eq("id", messageId);
    revalidatePath(PAGE);
    return { ok: false, error: sendResult.error };
  }

  await supabaseAdmin
    .from("email_marketing_messages")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider: sendResult.provider,
      provider_message_id: sendResult.providerMessageId,
      error_message: null,
    })
    .eq("id", messageId);

  if (sendResult.ok && provider === "gmail" && sendResult.gmailThreadId) {
    const mailbox = await getSharedMailbox();
    if (mailbox) {
      await importSentGmailMessage({
        mailboxId: mailbox.id,
        gmailMessageId: sendResult.providerMessageId ?? "",
        gmailThreadId: sendResult.gmailThreadId,
        sentByUserId: gate.staff.user_id,
        senderProfileId: payload.senderProfileId,
        subject: payload.subject,
        bodyText: payload.body,
        bodyHtml: html,
        toEmails: [payload.recipientEmail],
      });
    }
  }

  revalidatePath(PAGE);
  return { ok: true, messageId, id: messageId };
}

export async function uploadEmailMarketingFlyerAction(formData: FormData): Promise<EmailMarketingActionResult> {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isAdminOrHigher(gate.staff)) {
    return { ok: false, error: "Only admins can upload flyers." };
  }

  const title = readString(formData, "title");
  const description = readString(formData, "description");
  const file = formData.get("file");
  if (!title) return { ok: false, error: "Flyer title is required." };
  if (!(file instanceof File) || file.size <= 0) return { ok: false, error: "Choose a PDF or image file." };
  if (file.size > MAX_FLYER_BYTES) return { ok: false, error: "File is too large (max 15 MB)." };

  const mime = file.type || "application/octet-stream";
  const allowed =
    mime.startsWith("image/") || mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!allowed) return { ok: false, error: "Upload a PDF or image file." };

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from(EMAIL_MARKETING_FLYERS_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: publicUrlData } = supabaseAdmin.storage.from(EMAIL_MARKETING_FLYERS_BUCKET).getPublicUrl(storagePath);
  const fileUrl = publicUrlData.publicUrl;

  const { data, error } = await supabaseAdmin
    .from("email_marketing_flyers")
    .insert({
      file_name: safeName,
      file_url: fileUrl,
      storage_path: storagePath,
      file_type: mime,
      title,
      description,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message || "Could not save flyer metadata." };
  revalidatePath(PAGE);
  return { ok: true, id: data.id as string };
}

export async function toggleEmailMarketingTemplateAction(formData: FormData): Promise<EmailMarketingActionResult> {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isAdminOrHigher(gate.staff)) return { ok: false, error: "Only admins can edit templates." };

  const id = readString(formData, "id");
  const isActive = readBool(formData, "is_active");
  if (!id) return { ok: false, error: "Template id is required." };

  const { error } = await supabaseAdmin
    .from("email_marketing_templates")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, id };
}

export async function toggleEmailMarketingFlyerAction(formData: FormData): Promise<EmailMarketingActionResult> {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isAdminOrHigher(gate.staff)) return { ok: false, error: "Only admins can edit flyers." };

  const id = readString(formData, "id");
  const isActive = readBool(formData, "is_active");
  if (!id) return { ok: false, error: "Flyer id is required." };

  const { error } = await supabaseAdmin.from("email_marketing_flyers").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, id };
}

export async function markEmailThreadReadAction(formData: FormData): Promise<EmailMarketingActionResult> {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  const threadId = readString(formData, "thread_id");
  const read = readBool(formData, "read");
  if (!threadId) return { ok: false, error: "Thread id is required." };

  const readAt = read ? new Date().toISOString() : null;
  const { error } = await supabaseAdmin
    .from("email_messages")
    .update({ read_at: readAt })
    .eq("thread_id", threadId)
    .eq("direction", "inbound");
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, id: threadId };
}

export async function archiveEmailThreadAction(formData: FormData): Promise<EmailMarketingActionResult> {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  const threadId = readString(formData, "thread_id");
  const archived = readBool(formData, "archived");
  if (!threadId) return { ok: false, error: "Thread id is required." };

  const { error } = await supabaseAdmin
    .from("email_threads")
    .update({ status: archived ? "archived" : "open" })
    .eq("id", threadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, id: threadId };
}

export async function assignEmailThreadAction(formData: FormData): Promise<EmailMarketingActionResult> {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) return { ok: false, error: gate.error };

  const threadId = readString(formData, "thread_id");
  const assignedTo = readString(formData, "assigned_to") || null;
  if (!threadId) return { ok: false, error: "Thread id is required." };

  const { error } = await supabaseAdmin.from("email_threads").update({ assigned_to: assignedTo }).eq("id", threadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, id: threadId };
}
