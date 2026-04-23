import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getCoreOnboardingPipelineInputs } from "@/lib/onboarding/sync-progress";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";
const COOKIE = "onboarding_admin_preview_applicant";

/**
 * Exposes the preview applicant (cookie) to the client so it can set localStorage `applicantId`
 * to match the employee flow. Admin-gated; cookie is httpOnly.
 */
export async function GET() {
  const profile = await getStaffProfile();
  if (!isAdminOrHigher(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) {
    return NextResponse.json({
      applicantId: null as string | null,
      displayName: null as string | null,
      debug: null as unknown,
    });
  }

  const { data: ap } = await supabaseAdmin
    .from("applicants")
    .select("first_name, last_name")
    .eq("id", id)
    .maybeSingle<{ first_name: string | null; last_name: string | null }>();

  const displayName = [ap?.first_name, ap?.last_name].filter(Boolean).join(" ").trim() || null;

  const [{ data: obRow }, pipeline] = await Promise.all([
    supabaseAdmin
      .from("onboarding_status")
      .select("application_completed, onboarding_progress_percent, onboarding_completed_at, onboarding_last_activity_at")
      .eq("applicant_id", id)
      .maybeSingle(),
    getCoreOnboardingPipelineInputs(supabaseAdmin, id),
  ]);

  return NextResponse.json({
    applicantId: id,
    displayName,
    debug: { onboarding_status: obRow, pipeline },
  });
}
