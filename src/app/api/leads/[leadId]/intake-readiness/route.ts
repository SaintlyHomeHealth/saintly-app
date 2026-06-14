import { NextResponse } from "next/server";

import {
  loadLeadIntakeReadiness,
  refreshLeadIntakeReadiness,
  updateLeadIntakeReadiness,
} from "@/lib/crm/lead-intake-readiness";
import type { UpdateLeadIntakeReadinessInput } from "@/lib/crm/lead-intake-readiness-types";
import { getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const leadId = typeof rawLeadId === "string" ? rawLeadId.trim() : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  const { data: leadRow } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!leadRow?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const summary = await loadLeadIntakeReadiness(leadId, staff);
  if (!summary) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, ...summary });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const leadId = typeof rawLeadId === "string" ? rawLeadId.trim() : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  let body: UpdateLeadIntakeReadinessInput;
  try {
    body = (await req.json()) as UpdateLeadIntakeReadinessInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updateLeadIntakeReadiness(staff, leadId, body);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ ok: true, review: result.summary.review, ...result.summary });
}
