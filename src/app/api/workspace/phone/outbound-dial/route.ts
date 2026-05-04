import { NextResponse } from "next/server";

import { parseWorkspaceOutboundDialInput } from "@/lib/softphone/phone-number";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const INVALID_NUMBER_BODY = { ok: false as const, error: "Invalid phone number" };

/**
 * Pre-flight validation before Twilio Client connects / native shell starts an outbound leg.
 * Does not call Twilio — fast JSON gate for malformed dial input.
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { to?: string };
  try {
    body = (await req.json()) as { to?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.to === "string" ? body.to : "";
  const parsed = parseWorkspaceOutboundDialInput(raw);
  if (!parsed.ok) {
    return NextResponse.json(INVALID_NUMBER_BODY, { status: 400 });
  }

  return NextResponse.json({ ok: true as const, e164: parsed.e164 });
}
