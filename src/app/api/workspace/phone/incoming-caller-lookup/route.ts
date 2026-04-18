import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { normalizeInboundTwilioFromToE164, resolveInboundCallerInternal } from "@/lib/phone/inbound-caller-identity";
import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/**
 * Workspace staff: resolve display name for an inbound Twilio `From` / E.164 value (shared resolver).
 */
export async function GET(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fromParam = req.nextUrl.searchParams.get("from")?.trim() ?? "";
  const lower = fromParam.toLowerCase();
  if (!fromParam) {
    return NextResponse.json({
      rawFrom: "",
      formattedNumber: "",
      contactName: null as string | null,
      display_name: null as string | null,
      entity_type: "unknown" as const,
      entity_id: null as string | null,
      subtitle: null as string | null,
    });
  }

  if (lower.startsWith("client:")) {
    return NextResponse.json({
      rawFrom: fromParam,
      formattedNumber: "Internal / browser call",
      contactName: null as string | null,
      display_name: null as string | null,
      entity_type: "unknown" as const,
      entity_id: null as string | null,
      subtitle: null as string | null,
    });
  }

  const digitsKey = normalizePhone(fromParam);
  const formattedNumber =
    digitsKey.length >= 10 ? formatPhoneNumber(fromParam) : fromParam || "Unknown caller";

  if (digitsKey.length < 10) {
    return NextResponse.json({
      rawFrom: fromParam,
      formattedNumber,
      contactName: null as string | null,
      display_name: null as string | null,
      entity_type: "unknown" as const,
      entity_id: null as string | null,
      subtitle: null as string | null,
    });
  }

  const e164Key = normalizeInboundTwilioFromToE164(fromParam);
  if (!e164Key) {
    return NextResponse.json({
      rawFrom: fromParam,
      formattedNumber,
      contactName: null as string | null,
      display_name: null as string | null,
      entity_type: "unknown" as const,
      entity_id: null as string | null,
      subtitle: null as string | null,
    });
  }

  try {
    const r = await resolveInboundCallerInternal(supabaseAdmin, fromParam);
    const name = r.caller_name?.trim() || null;
    return NextResponse.json({
      rawFrom: fromParam,
      formattedNumber: r.formatted_number || formattedNumber,
      contactName: name,
      display_name: name,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      subtitle: r.subtitle,
    });
  } catch (e) {
    console.warn("[workspace/phone/incoming-caller-lookup]", e instanceof Error ? e.message : e);
    return NextResponse.json({
      rawFrom: fromParam,
      formattedNumber,
      contactName: null as string | null,
      display_name: null as string | null,
      entity_type: "unknown" as const,
      entity_id: null as string | null,
      subtitle: null as string | null,
    });
  }
}
