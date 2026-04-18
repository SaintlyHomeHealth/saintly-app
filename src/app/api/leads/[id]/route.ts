import { NextResponse } from "next/server";

import { sendAdmittedPatientToMeta } from "@/lib/integrations/meta/send-admitted-patient-to-meta";
import { sendQualifiedLeadToMeta } from "@/lib/integrations/meta/send-qualified-lead-to-meta";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

type LeadQuality = "qualified" | "unqualified";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" as const }, { status: 403 });
  }

  const { id } = await ctx.params;
  const leadId = typeof id === "string" ? id.trim() : "";
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "invalid_id" as const }, { status: 400 });
  }

  let body: { lead_quality?: unknown; status?: unknown };
  try {
    body = (await req.json()) as { lead_quality?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" as const }, { status: 400 });
  }

  const hasLeadQuality = body.lead_quality !== undefined;
  const hasStatus = body.status !== undefined;
  if (!hasLeadQuality && !hasStatus) {
    return NextResponse.json({ ok: false, error: "invalid_body" as const }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (hasLeadQuality) {
    const q = body.lead_quality;
    if (q !== "qualified" && q !== "unqualified") {
      return NextResponse.json({ ok: false, error: "invalid_quality" as const }, { status: 400 });
    }
    updates.lead_quality = q as LeadQuality;
  }
  if (hasStatus) {
    if (typeof body.status !== "string" || !body.status.trim()) {
      return NextResponse.json({ ok: false, error: "invalid_status" as const }, { status: 400 });
    }
    updates.status = body.status.trim();
  }

  let prevStatus: string | null = null;
  if (hasStatus) {
    const { data: prevRow } = await supabaseAdmin
      .from("leads")
      .select("status")
      .eq("id", leadId)
      .is("deleted_at", null)
      .maybeSingle();
    prevStatus = typeof prevRow?.status === "string" ? prevRow.status.trim() : "";
  }

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update(updates)
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id, lead_quality, updated_at, fbclid, status")
    .maybeSingle();

  if (error) {
    console.warn("[api/leads/[id]] PATCH:", error.message);
    return NextResponse.json({ ok: false, error: "save_failed" as const }, { status: 500 });
  }
  if (!data?.id) {
    return NextResponse.json({ ok: false, error: "not_found" as const }, { status: 404 });
  }

  await sendQualifiedLeadToMeta({
    id: data.id as string,
    fbclid: data.fbclid as string | null | undefined,
    lead_quality: data.lead_quality as string | null | undefined,
  });

  if (hasStatus) {
    const newSt = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
    const prevSt = (prevStatus ?? "").toLowerCase();
    if (newSt === "admitted" && prevSt !== "admitted") {
      await sendAdmittedPatientToMeta({
        id: data.id as string,
        fbclid: data.fbclid as string | null | undefined,
        lead_status: data.status as string | null | undefined,
      });
    }
  }

  return NextResponse.json({
    ok: true as const,
    lead: {
      id: data.id as string,
      lead_quality: data.lead_quality as string,
      updated_at: data.updated_at as string,
      status: data.status as string | null,
    },
  });
}
