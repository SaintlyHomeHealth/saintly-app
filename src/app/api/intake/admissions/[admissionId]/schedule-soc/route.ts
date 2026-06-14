import { NextResponse } from "next/server";

import { markAdmissionScheduled } from "@/lib/crm/lead-admission-handoff";
import { getStaffProfile } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ admissionId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { admissionId } = await ctx.params;
  if (!UUID_RE.test(admissionId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: {
    scheduled_soc_at?: string;
    assigned_clinician_name?: string | null;
    assigned_clinician_id?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.scheduled_soc_at?.trim()) {
    return NextResponse.json({ ok: false, error: "scheduled_soc_required" }, { status: 400 });
  }

  const result = await markAdmissionScheduled(staff, admissionId, {
    scheduled_soc_at: body.scheduled_soc_at,
    assigned_clinician_name: body.assigned_clinician_name,
    assigned_clinician_id: body.assigned_clinician_id,
  });
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, ...result.detail });
}
