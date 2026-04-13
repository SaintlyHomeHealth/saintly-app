import { NextResponse } from "next/server";

import { saveLeadQuickNote } from "@/app/admin/crm/actions";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

/**
 * CRM lead thread: append a quick note. Used from client components
 * so no server action is passed across the RSC boundary.
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" as const }, { status: 403 });
  }

  let body: { leadId?: string; quick_note?: string };
  try {
    body = (await req.json()) as { leadId?: string; quick_note?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" as const }, { status: 400 });
  }

  const fd = new FormData();
  fd.set("leadId", typeof body.leadId === "string" ? body.leadId : "");
  fd.set("quick_note", typeof body.quick_note === "string" ? body.quick_note : "");

  const r = await saveLeadQuickNote(fd);
  if (!r.ok) {
    const status = r.error === "forbidden" ? 403 : r.error === "empty" ? 400 : 500;
    return NextResponse.json(r, { status });
  }
  return NextResponse.json(r);
}
