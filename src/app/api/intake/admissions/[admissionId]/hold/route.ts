import { NextResponse } from "next/server";

import { putAdmissionOnHold } from "@/lib/crm/lead-admission-handoff";
import { getStaffProfile } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ admissionId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { admissionId } = await ctx.params;
  if (!UUID_RE.test(admissionId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let note: string | null = null;
  try {
    const body = (await req.json()) as { note?: string };
    note = body.note?.trim() || null;
  } catch {
    /* optional */
  }

  const result = await putAdmissionOnHold(staff, admissionId, note);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, ...result.detail });
}
