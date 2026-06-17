import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { moveCrmLeadToRecruiting } from "@/lib/crm/move-crm-lead-to-recruiting";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const result = await moveCrmLeadToRecruiting(supabaseAdmin, rawLeadId ?? "");

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${rawLeadId}`);
  revalidatePath("/admin/recruiting-leads");
  revalidatePath(`/admin/recruiting-leads/${result.recruitingLeadId}`);

  return NextResponse.json({
    ok: true,
    recruitingLeadId: result.recruitingLeadId,
    redirectTo: `/admin/recruiting-leads/${result.recruitingLeadId}`,
  });
}
