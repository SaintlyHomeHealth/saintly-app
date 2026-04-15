import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { ensureRecruitingCandidateCrmContact } from "@/lib/recruiting/recruiting-crm-contact-sync";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { buildWorkspaceKeypadCallHref } from "@/lib/workspace-phone/launch-urls";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ensures CRM contact link, then redirects to the workspace keypad with dial context.
 * Used by recruiting list/detail "Call" so the recruit page can stay open in the original tab.
 */
export async function GET(request: Request, context: { params: Promise<{ candidateId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  const { candidateId: raw } = await context.params;
  const candidateId = typeof raw === "string" ? raw.trim() : "";
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return NextResponse.redirect(new URL("/admin/recruiting", request.url));
  }

  const ensured = await ensureRecruitingCandidateCrmContact(supabaseAdmin, candidateId);

  if (!ensured.dialE164) {
    return NextResponse.redirect(new URL(`/admin/recruiting/${candidateId}?error=no_phone`, request.url));
  }

  const href = buildWorkspaceKeypadCallHref({
    dial: ensured.dialE164,
    contactId: ensured.contactId ?? undefined,
    contextName: ensured.contextName ?? undefined,
    candidateId,
    source: "recruiting",
    placeCall: false,
  });

  return NextResponse.redirect(new URL(href, request.url));
}
