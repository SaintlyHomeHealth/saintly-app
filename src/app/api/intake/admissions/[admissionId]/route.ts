import { NextResponse } from "next/server";

import { loadAdmissionHandoffDetail, updateAdmissionHandoff } from "@/lib/crm/lead-admission-handoff";
import type { UpdateAdmissionHandoffInput } from "@/lib/crm/lead-admission-handoff-types";
import { getStaffProfile } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ admissionId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { admissionId } = await ctx.params;
  if (!UUID_RE.test(admissionId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const detail = await loadAdmissionHandoffDetail(admissionId, staff);
  if (!detail) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, ...detail });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ admissionId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { admissionId } = await ctx.params;
  if (!UUID_RE.test(admissionId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: UpdateAdmissionHandoffInput;
  try {
    body = (await req.json()) as UpdateAdmissionHandoffInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updateAdmissionHandoff(staff, admissionId, body);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, ...result.detail });
}
