import { NextResponse } from "next/server";

import {
  getOrCreateAdmissionHandoffForLead,
  loadLeadAdmissionHandoffPanel,
} from "@/lib/crm/lead-admission-handoff";
import { getStaffProfile } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { leadId } = await ctx.params;
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  const panel = await loadLeadAdmissionHandoffPanel(leadId, staff);
  if (!panel) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  return NextResponse.json({ ok: true, ...panel });
}

export async function POST(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { leadId } = await ctx.params;
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  const result = await getOrCreateAdmissionHandoffForLead(leadId, staff.user_id);
  if (!result.ok) {
    const status = result.error === "lead_not_accepted" ? 400 : result.error === "forbidden" ? 403 : 500;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, handoff: result.handoff });
}
