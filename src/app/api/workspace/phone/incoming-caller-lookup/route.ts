import { NextRequest, NextResponse } from "next/server";

import {
  buildIncomingContactDisplayName,
  normalizedPhonesEquivalent,
  type IncomingCallerContactRow,
} from "@/lib/crm/incoming-caller-lookup";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/**
 * Workspace staff: resolve CRM contact display name for an inbound Twilio `From` / E.164 value.
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
    });
  }

  if (lower.startsWith("client:")) {
    return NextResponse.json({
      rawFrom: fromParam,
      formattedNumber: "Internal / browser call",
      contactName: null as string | null,
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
    });
  }

  const last10 = digitsKey.slice(-10);
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("full_name, first_name, last_name, organization_name, primary_phone, secondary_phone")
    .or(`primary_phone.ilike.%${last10}%,secondary_phone.ilike.%${last10}%`)
    .limit(40);

  if (error) {
    console.warn("[workspace/phone/incoming-caller-lookup]", error.message);
    return NextResponse.json({
      rawFrom: fromParam,
      formattedNumber,
      contactName: null as string | null,
    });
  }

  const rows = (data ?? []) as IncomingCallerContactRow[];
  const match = rows.find(
    (r) =>
      normalizedPhonesEquivalent(r.primary_phone, digitsKey) ||
      normalizedPhonesEquivalent(r.secondary_phone, digitsKey)
  );
  const contactName = match ? buildIncomingContactDisplayName(match) : null;

  return NextResponse.json({
    rawFrom: fromParam,
    formattedNumber,
    contactName,
  });
}
