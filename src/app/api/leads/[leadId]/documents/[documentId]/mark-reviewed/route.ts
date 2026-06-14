import { NextResponse } from "next/server";

import { markLeadReferralDocumentReviewed } from "@/lib/crm/lead-referral-documents";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ leadId: string; documentId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId, documentId } = await ctx.params;
  const lid = typeof leadId === "string" ? leadId.trim() : "";
  const did = typeof documentId === "string" ? documentId.trim() : "";
  if (!UUID_RE.test(lid) || !UUID_RE.test(did)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { review_notes?: string | null } = {};
  try {
    body = (await req.json()) as { review_notes?: string | null };
  } catch {
    body = {};
  }

  const result = await markLeadReferralDocumentReviewed({
    leadId: lid,
    documentId: did,
    reviewedBy: staff.user_id,
    reviewNotes: body.review_notes ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: result.document });
}
