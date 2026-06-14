import { NextResponse } from "next/server";

import { updateAdmissionChecklistItem } from "@/lib/crm/lead-admission-handoff";
import type { UpdateAdmissionChecklistItemInput } from "@/lib/crm/lead-admission-handoff-types";
import { getStaffProfile } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ admissionId: string; itemId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { itemId } = await ctx.params;
  if (!UUID_RE.test(itemId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: UpdateAdmissionChecklistItemInput;
  try {
    body = (await req.json()) as UpdateAdmissionChecklistItemInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updateAdmissionChecklistItem(staff, itemId, body);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, item: result.item });
}
