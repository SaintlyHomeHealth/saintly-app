import { NextResponse } from "next/server";

import { deleteLeadActivity } from "@/app/admin/crm/actions";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

/**
 * CRM lead thread: soft-delete a manual note (manager+). Used from client components
 * so no server action is passed across the RSC boundary.
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" as const }, { status: 403 });
  }

  let body: { leadId?: string; activityId?: string };
  try {
    body = (await req.json()) as { leadId?: string; activityId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" as const }, { status: 400 });
  }

  const fd = new FormData();
  fd.set("leadId", typeof body.leadId === "string" ? body.leadId : "");
  fd.set("activityId", typeof body.activityId === "string" ? body.activityId : "");

  const r = await deleteLeadActivity(fd);
  if (!r.ok) {
    const status =
      r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : r.error === "invalid" ? 400 : 500;
    return NextResponse.json(r, { status });
  }
  return NextResponse.json(r);
}
