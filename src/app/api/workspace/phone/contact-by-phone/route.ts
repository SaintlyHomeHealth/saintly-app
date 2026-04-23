import { NextRequest, NextResponse } from "next/server";

import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { labelForContactType } from "@/lib/crm/contact-types";
import { normalizePhoneInputToE164 } from "@/lib/crm/quick-save-contact";
import { supabaseAdmin } from "@/lib/admin";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/**
 * Returns whether this dialable number already matches a CRM contact (for showing "Save contact" vs skip).
 */
export async function GET(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("phone")?.trim() ?? "";
  const norm = normalizePhoneInputToE164(raw);
  if ("error" in norm) {
    return NextResponse.json({ match: null, e164: null, reason: norm.error });
  }

  const match = await findContactByIncomingPhone(supabaseAdmin, norm.e164);
  if (!match?.id) {
    return NextResponse.json({
      match: null,
      e164: norm.e164,
    });
  }

  const display =
    (match.full_name ?? "").trim() ||
    [match.first_name, match.last_name].filter(Boolean).join(" ").trim() ||
    (match.organization_name ?? "").trim() ||
    norm.e164;

  const { data: leadRows } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id, status").eq("contact_id", match.id)
  );
  const leadActive = (leadRows ?? []).some((L) => {
    const s = typeof L.status === "string" ? L.status.trim().toLowerCase() : "";
    return s && s !== "converted" && s !== "dead_lead";
  });
  const { data: pat } = await supabaseAdmin.from("patients").select("id").eq("contact_id", match.id).maybeSingle();

  return NextResponse.json({
    match: {
      id: match.id,
      displayName: display,
      contactTypeLabel: labelForContactType(match.contact_type),
      hasActiveLead: leadActive,
      hasPatient: Boolean(pat?.id),
    },
    e164: norm.e164,
  });
}
