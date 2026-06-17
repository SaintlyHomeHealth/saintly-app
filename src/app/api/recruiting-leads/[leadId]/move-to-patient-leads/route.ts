import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { restorePatientLeadFromRecruiting } from "@/lib/crm/restore-patient-lead-from-recruiting";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const result = await restorePatientLeadFromRecruiting(supabaseAdmin, rawLeadId ?? "", {
    restoredReason: "manual_admin_move_to_patient_leads",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  revalidatePath("/admin/recruiting-leads");
  revalidatePath(`/admin/recruiting-leads/${result.recruitingLeadId}`);
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${result.crmLeadId}`);

  return NextResponse.json({
    ok: true,
    crmLeadId: result.crmLeadId,
    recruitingLeadId: result.recruitingLeadId,
    redirectTo: `/admin/crm/leads/${result.crmLeadId}`,
  });
}
