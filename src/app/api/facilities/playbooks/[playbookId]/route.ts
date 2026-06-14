import { NextResponse } from "next/server";

import { getPlaybook, updatePlaybook } from "@/lib/crm/facility-playbooks";
import type { UpsertPlaybookInput } from "@/lib/crm/facility-playbooks";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ playbookId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { playbookId } = await context.params;
  const playbook = await getPlaybook(playbookId);
  if (!playbook) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, playbook });
}

export async function PATCH(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { playbookId } = await context.params;
  let body: UpsertPlaybookInput;
  try {
    body = (await req.json()) as UpsertPlaybookInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updatePlaybook(staff, playbookId, body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
