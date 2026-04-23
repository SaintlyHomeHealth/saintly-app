import "server-only";

import { deliverOnboardingResumeEmail } from "@/lib/admin/onboarding-invite";
import { supabaseAdmin } from "@/lib/admin";
import {
  isOnboardingEmailConfigured,
  ONBOARDING_EMAIL_NOT_CONFIGURED_ERROR,
} from "@/lib/email/send-onboarding-invite";

const RESUME_COOLDOWN_MS = 90_000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function recentInviteSendMsForApplicant(applicantId: string): Promise<number | null> {
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

export const RESUME_ONBOARDING_GENERIC_SUCCESS =
  "If we have an onboarding profile for that email, we sent a link. Check your inbox and spam folder.";

export type RequestOnboardingResumeLinkResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Looks up applicant by email (most recently updated row) and emails the stable onboarding entry URL.
 * Responses are safe to show whether or not the email matched a record.
 */
export async function requestOnboardingResumeLink(rawEmail: string): Promise<RequestOnboardingResumeLinkResult> {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!isOnboardingEmailConfigured()) {
    return { ok: false, error: ONBOARDING_EMAIL_NOT_CONFIGURED_ERROR };
  }

  const { data: rows, error } = await supabaseAdmin
    .from("applicants")
    .select("id, first_name, last_name, email")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("[resume-onboarding] lookup:", error.message);
    return { ok: true, message: RESUME_ONBOARDING_GENERIC_SUCCESS };
  }

  const applicant = rows?.[0];
  if (!applicant?.id) {
    return { ok: true, message: RESUME_ONBOARDING_GENERIC_SUCCESS };
  }

  const lastMs = await recentInviteSendMsForApplicant(applicant.id);
  if (lastMs && Date.now() - lastMs < RESUME_COOLDOWN_MS) {
    return {
      ok: true,
      message:
        "Please wait a minute or two before requesting another link. Check your inbox and spam folder.",
    };
  }

  const result = await deliverOnboardingResumeEmail({
    applicantId: applicant.id,
    firstName: String(applicant.first_name || ""),
    lastName: String(applicant.last_name || ""),
    email,
  });

  if (!result.ok) {
    console.warn("[resume-onboarding] send failed:", result.error);
    return {
      ok: false,
      error:
        "We could not send email right now. Please try again later or contact your hiring contact.",
    };
  }

  return { ok: true, message: RESUME_ONBOARDING_GENERIC_SUCCESS };
}
