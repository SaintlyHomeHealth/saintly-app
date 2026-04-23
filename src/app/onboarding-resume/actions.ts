"use server";

import { requestOnboardingResumeLink, type RequestOnboardingResumeLinkResult } from "@/lib/onboarding/resume-link-request";

export async function requestOnboardingResumeLinkAction(
  _prev: RequestOnboardingResumeLinkResult | null,
  formData: FormData
): Promise<RequestOnboardingResumeLinkResult> {
  const email = String(formData.get("email") ?? "");
  return requestOnboardingResumeLink(email);
}
