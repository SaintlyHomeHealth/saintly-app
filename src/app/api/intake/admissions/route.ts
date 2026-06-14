import { NextResponse } from "next/server";

import { getOrCreateAdmissionHandoffForLead, listAdmissionHandoffs } from "@/lib/crm/lead-admission-handoff";
import type { AdmissionHandoffListFilters } from "@/lib/crm/lead-admission-handoff-types";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const filters: AdmissionHandoffListFilters = {
    tab: (url.searchParams.get("tab") as AdmissionHandoffListFilters["tab"]) ?? "all",
    priority: (url.searchParams.get("priority") as AdmissionHandoffListFilters["priority"]) ?? null,
    target_soc_from: url.searchParams.get("target_soc_from"),
    target_soc_to: url.searchParams.get("target_soc_to"),
    assigned_intake_owner: url.searchParams.get("assigned_intake_owner"),
    assigned_clinician_id: url.searchParams.get("assigned_clinician_id"),
    payer_status: url.searchParams.get("payer_status") as AdmissionHandoffListFilters["payer_status"],
    auth_status: url.searchParams.get("auth_status") as AdmissionHandoffListFilters["auth_status"],
    alora_status: url.searchParams.get("alora_status") as AdmissionHandoffListFilters["alora_status"],
    referring_facility_id: url.searchParams.get("referring_facility_id"),
    has_missing_items: url.searchParams.get("has_missing_items") === "1",
    rep_id: url.searchParams.get("rep_id"),
  };

  const admissions = await listAdmissionHandoffs(staff, filters);
  return NextResponse.json({ ok: true, admissions });
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { lead_id?: string };
  try {
    body = (await req.json()) as { lead_id?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
  if (!leadId) return NextResponse.json({ ok: false, error: "lead_id_required" }, { status: 400 });

  const result = await getOrCreateAdmissionHandoffForLead(leadId, staff.user_id);
  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "lead_not_found" || result.error === "lead_not_accepted"
          ? 400
          : 500;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, handoff: result.handoff });
}
