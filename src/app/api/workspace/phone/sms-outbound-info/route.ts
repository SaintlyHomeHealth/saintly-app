import { NextResponse } from "next/server";

import { getTwilioSmsOutboundDiagnostics } from "@/lib/twilio/sms-outbound-diagnostics";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/**
 * Non-secret SMS outbound identity for workspace compose UI (masked sender / mode).
 * Does not expose raw phone numbers or SIDs beyond existing masked diagnostics.
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d = getTwilioSmsOutboundDiagnostics();
  return NextResponse.json({
    credentialsComplete: d.credentialsComplete,
    missingEnvVars: d.missingEnvVars,
    outboundMode: d.outboundMode,
    outboundSenderMasked: d.outboundSenderMasked,
    /** True when multiple SMS send identities could be chosen — not supported by send path yet. */
    selectable: false,
  });
}
