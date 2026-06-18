import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { hardDeleteRecruitingLead } from "@/lib/recruiting/hard-delete-recruiting-lead";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const result = await hardDeleteRecruitingLead(supabaseAdmin, rawLeadId ?? "");

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  revalidatePath("/admin/recruiting");
  revalidatePath(`/admin/recruiting/leads/${result.leadId}`);

  return NextResponse.json({
    ok: true,
    leadId: result.leadId,
    suppressed_candidates: result.suppressedCandidates,
  });
}
