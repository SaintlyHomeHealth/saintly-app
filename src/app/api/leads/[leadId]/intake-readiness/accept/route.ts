import { NextResponse } from "next/server";

import { acceptLeadReferral } from "@/lib/crm/lead-intake-readiness";
import type { AcceptLeadReferralInput } from "@/lib/crm/lead-intake-readiness-types";
import { getStaffProfile } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const leadId = typeof rawLeadId === "string" ? rawLeadId.trim() : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  let body: AcceptLeadReferralInput = {};
  try {
    body = (await req.json()) as AcceptLeadReferralInput;
  } catch {
    body = {};
  }

  const result = await acceptLeadReferral(staff, leadId, body);
  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "lead_not_found" || result.error === "not_found"
          ? 404
          : result.error === "already_accepted" || result.error === "already_converted"
            ? 409
            : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({
    ok: true,
    ...result.summary,
    admission_handoff_id: result.admission_handoff_id,
  });
}
