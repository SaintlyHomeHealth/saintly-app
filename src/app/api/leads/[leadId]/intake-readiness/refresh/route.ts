import { NextResponse } from "next/server";

import { refreshLeadIntakeReadiness } from "@/lib/crm/lead-intake-readiness";
import { getStaffProfile } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const leadId = typeof rawLeadId === "string" ? rawLeadId.trim() : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  const summary = await refreshLeadIntakeReadiness(leadId, staff);
  if (!summary) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...summary });
}
