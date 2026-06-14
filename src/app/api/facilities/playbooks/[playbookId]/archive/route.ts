import { NextResponse } from "next/server";

import { archivePlaybook } from "@/lib/crm/facility-playbooks";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ playbookId: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { playbookId } = await context.params;
  const result = await archivePlaybook(staff, playbookId);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
