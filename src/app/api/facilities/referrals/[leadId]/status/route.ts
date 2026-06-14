import { NextResponse } from "next/server";

import { leadStatusForPipelineStage } from "@/lib/crm/facility-referral-pipeline-utils";
import { FACILITY_REFERRAL_PIPELINE_STAGES } from "@/lib/crm/facility-referral-pipeline-types";
import { updateFacilityReferralStatus } from "@/lib/crm/facility-referral-intake";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

const STAGE_LABEL_TO_KEY = Object.fromEntries(
  FACILITY_REFERRAL_PIPELINE_STAGES.map((s) => [s.label.toLowerCase(), s.key])
);

function resolveStatus(body: { status?: string }): string | null {
  const raw = (body.status ?? "").trim();
  if (!raw) return null;
  const key = STAGE_LABEL_TO_KEY[raw.toLowerCase()];
  if (key) return leadStatusForPipelineStage(key);
  return raw;
}

export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId } = await ctx.params;
  let body: {
    status?: string;
    note?: string;
    lost_reason?: string | null;
    create_source_follow_up?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const status = resolveStatus(body);
  if (!status) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const result = await updateFacilityReferralStatus(staff, leadId, {
    status,
    note: body.note,
    lost_reason: body.lost_reason,
    create_source_follow_up: body.create_source_follow_up,
  });

  if (!result.ok) {
    const code = result.error === "lost_reason_required" ? 400 : result.error === "lead_not_found" ? 404 : 400;
    return NextResponse.json(result, { status: code });
  }

  return NextResponse.json({ ok: true });
}
