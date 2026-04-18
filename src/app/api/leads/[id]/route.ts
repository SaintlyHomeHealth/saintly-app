import { NextResponse } from "next/server";

import { sendQualifiedLeadToZapier } from "@/lib/integrations/zapier/send-qualified-lead-to-zapier";
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

  let body: { lead_quality?: unknown };
  try {
    body = (await req.json()) as { lead_quality?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" as const }, { status: 400 });
  }

  const q = body.lead_quality;
  if (q !== "qualified" && q !== "unqualified") {
    return NextResponse.json({ ok: false, error: "invalid_quality" as const }, { status: 400 });
  }

  const lead_quality = q as LeadQuality;

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update({ lead_quality })
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id, lead_quality, updated_at, fbclid")
    .maybeSingle();

  if (error) {
    console.warn("[api/leads/[id]] PATCH:", error.message);
    return NextResponse.json({ ok: false, error: "save_failed" as const }, { status: 500 });
  }
  if (!data?.id) {
    return NextResponse.json({ ok: false, error: "not_found" as const }, { status: 404 });
  }

  sendQualifiedLeadToZapier({
    id: data.id as string,
    fbclid: data.fbclid as string | null | undefined,
    lead_quality: data.lead_quality as string | null | undefined,
  });

  return NextResponse.json({
    ok: true as const,
    lead: {
      id: data.id as string,
      lead_quality: data.lead_quality as string,
      updated_at: data.updated_at as string,
    },
  });
}
