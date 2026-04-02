import "server-only";

import { revalidatePath } from "next/cache";

import { insertAuditLogTrusted } from "@/lib/audit-log";
import { sendOnboardingInviteEmail } from "@/lib/email/send-onboarding-invite";
import { appendOutboundSmsToConversation, ensureSmsConversationForOutboundSystem } from "@/lib/phone/sms-conversation-thread";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { sendSms } from "@/lib/twilio/send-sms";
import { supabaseAdmin } from "@/lib/admin";

export type OnboardingInviteChannel = "sms" | "email" | "both";

const SMS_BODY_TEMPLATE =
  "Welcome to Saintly Home Health. Please complete your onboarding here: {link}";

const RESEND_COOLDOWN_MS = 45_000;

function publicAppOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

export function buildOnboardingEntryLink(applicantId: string): string {
  const base = publicAppOrigin();
  const path = `/onboarding-welcome?applicant=${encodeURIComponent(applicantId)}`;
  if (!base) return path;
  return `${base}${path}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findOrCreateApplicant(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<{ ok: true; applicantId: string } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "A valid email is required." };
  }

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("applicants")
    .select("id, status")
    .eq("email", email)
    .maybeSingle<{ id: string; status?: string | null }>();

  if (findErr) {
    return { ok: false, error: findErr.message };
  }

  const patch = {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email,
    phone: input.phone.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: upErr } = await supabaseAdmin.from("applicants").update(patch).eq("id", existing.id);
    if (upErr) {
      return { ok: false, error: upErr.message };
    }
    return { ok: true, applicantId: existing.id };
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("applicants")
    .insert({
      ...patch,
      status: "applicant",
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    return { ok: false, error: insErr?.message || "Could not create applicant." };
  }

  return { ok: true, applicantId: inserted.id };
}

async function mergeInviteOntoOnboardingStatus(applicantId: string, channel: OnboardingInviteChannel) {
  const now = new Date().toISOString();
  const { data: row } = await supabaseAdmin
    .from("onboarding_status")
    .select("applicant_id")
    .eq("applicant_id", applicantId)
    .maybeSingle();

  const invitePatch = {
    onboarding_invite_status: "sent" as const,
    onboarding_invite_sent_at: now,
    onboarding_invite_last_channel: channel,
  };

  if (row?.applicant_id) {
    await supabaseAdmin.from("onboarding_status").update(invitePatch).eq("applicant_id", applicantId);
    return;
  }

  await supabaseAdmin.from("onboarding_status").insert({
    applicant_id: applicantId,
    application_completed: false,
    current_step: 1,
    onboarding_progress_percent: 0,
    onboarding_flow_status: "not_started",
    ...invitePatch,
  });
}

async function recentInviteSendMs(applicantId: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("onboarding_invite_sends")
    .select("created_at")
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();

  if (!data?.created_at) return null;
  return new Date(data.created_at).getTime();
}

export type SendOnboardingInviteInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  channel: OnboardingInviteChannel;
  staffUserId: string;
  /** When false, still respects short cooldown (anti double-click). */
  allowCooldownBypass?: boolean;
};

export type SendOnboardingInviteResult =
  | { ok: true; applicantId: string; link: string; smsSent: boolean; emailSent: boolean }
  | { ok: false; error: string };

/**
 * Admin: create/reuse applicant, persist invite metadata, send SMS and/or email, audit log.
 */
export async function sendOnboardingInvite(
  input: SendOnboardingInviteInput
): Promise<SendOnboardingInviteResult> {
  const channel = input.channel;
  if (channel !== "sms" && channel !== "email" && channel !== "both") {
    return { ok: false, error: "Invalid send method." };
  }

  const created = await findOrCreateApplicant({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
  });
  if (!created.ok) {
    return created;
  }

  const applicantId = created.applicantId;
  const link = buildOnboardingEntryLink(applicantId);

  if (!input.allowCooldownBypass) {
    const lastMs = await recentInviteSendMs(applicantId);
    if (lastMs && Date.now() - lastMs < RESEND_COOLDOWN_MS) {
      return { ok: false, error: "Please wait a moment before sending another invite." };
    }
  }

  let smsSent = false;
  let emailSent = false;
  let twilioSid: string | null = null;

  const e164 = normalizeDialInputToE164(input.phone);
  const phoneOk = Boolean(e164 && isValidE164(e164));

  if (channel === "sms" || channel === "both") {
    if (!phoneOk) {
      return { ok: false, error: "SMS requires a valid mobile number (E.164)." };
    }
    const body = SMS_BODY_TEMPLATE.replace("{link}", link);
    const conv = await ensureSmsConversationForOutboundSystem(supabaseAdmin, e164!);
    if (!conv.ok) {
      return { ok: false, error: conv.error };
    }
    const sms = await sendSms({ to: e164!, body });
    if (!sms.ok) {
      return { ok: false, error: sms.error };
    }
    twilioSid = sms.messageSid;
    const appended = await appendOutboundSmsToConversation(supabaseAdmin, {
      conversationId: conv.conversationId,
      body,
      messageSid: sms.messageSid,
      metadata: {
        source: "onboarding_invite",
        applicant_id: applicantId,
        staff_user_id: input.staffUserId,
      },
    });
    if (!appended.ok) {
      console.warn("[onboarding-invite] conversation log failed:", appended.error);
    }
    smsSent = true;
  }

  if (channel === "email" || channel === "both") {
    const emailResult = await sendOnboardingInviteEmail({
      to: normalizeEmail(input.email),
      firstName: input.firstName.trim(),
      link,
    });
    if (!emailResult.ok) {
      if (smsSent) {
        console.warn("[onboarding-invite] email failed after SMS:", emailResult.error);
      } else {
        return { ok: false, error: emailResult.error };
      }
    } else {
      emailSent = true;
    }
  }

  await mergeInviteOntoOnboardingStatus(applicantId, channel);

  const { error: logErr } = await supabaseAdmin.from("onboarding_invite_sends").insert({
    applicant_id: applicantId,
    staff_user_id: input.staffUserId,
    channels: channel,
    twilio_message_sid: twilioSid,
    email_sent: emailSent,
    onboarding_link: link,
    metadata: {
      sms_sent: smsSent,
      email_sent: emailSent,
    },
  });
  if (logErr) {
    console.error("[onboarding-invite] audit insert:", logErr.message);
  }

  await insertAuditLogTrusted({
    action: "onboarding_invite_sent",
    entityType: "applicant",
    entityId: applicantId,
    metadata: {
      channels: channel,
      sms_sent: smsSent,
      email_sent: emailSent,
      link,
    },
  });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${applicantId}`);

  return { ok: true, applicantId, link, smsSent, emailSent };
}

export type ResendOnboardingInviteInput = {
  applicantId: string;
  channel: "sms" | "email";
  staffUserId: string;
};

export async function resendOnboardingInvite(
  input: ResendOnboardingInviteInput
): Promise<SendOnboardingInviteResult> {
  const { data: applicant, error } = await supabaseAdmin
    .from("applicants")
    .select("id, first_name, last_name, email, phone")
    .eq("id", input.applicantId)
    .maybeSingle<{
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      phone?: string | null;
    }>();

  if (error || !applicant) {
    return { ok: false, error: "Applicant not found." };
  }

  return sendOnboardingInvite({
    firstName: String(applicant.first_name || ""),
    lastName: String(applicant.last_name || ""),
    email: String(applicant.email || ""),
    phone: String(applicant.phone || ""),
    channel: input.channel,
    staffUserId: input.staffUserId,
    allowCooldownBypass: true,
  });
}
