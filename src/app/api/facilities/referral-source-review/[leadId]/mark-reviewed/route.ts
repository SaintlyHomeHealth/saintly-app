import { NextResponse } from "next/server";

import { markReferralSourceReviewed } from "@/lib/crm/facility-referral-source-review";
import type { ReferralSourceReviewMarkReason } from "@/lib/crm/facility-referral-source-review-types";
import { getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ leadId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { leadId } = await context.params;
  let body: { reason?: ReferralSourceReviewMarkReason; notes?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const result = await markReferralSourceReviewed(staff, leadId, {
    reason: body.reason,
    notes: body.notes,
  });

  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
