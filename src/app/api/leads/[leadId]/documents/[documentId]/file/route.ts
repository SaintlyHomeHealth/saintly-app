import { NextResponse } from "next/server";

import { createLeadReferralDocumentSignedUrl } from "@/lib/crm/lead-referral-documents";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ leadId: string; documentId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { leadId, documentId } = await ctx.params;
  const lid = typeof leadId === "string" ? leadId.trim() : "";
  const did = typeof documentId === "string" ? documentId.trim() : "";
  if (!UUID_RE.test(lid) || !UUID_RE.test(did)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const url = new URL(req.url);
  const forceDownload =
    url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true";

  const signedUrl = await createLeadReferralDocumentSignedUrl(lid, did, forceDownload);
  if (!signedUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.redirect(signedUrl);
}
