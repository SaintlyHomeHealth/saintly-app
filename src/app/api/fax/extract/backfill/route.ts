import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { extractInboundFaxStructured } from "@/lib/fax/inbound-fax-extract";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dryRun?: boolean; limit?: number } = {};
  try {
    body = (await req.json()) as { dryRun?: boolean; limit?: number };
  } catch {
    body = {};
  }

  const dryRun = body.dryRun !== false;
  const limit = Math.min(Math.max(Number(body.limit) || 135, 1), 200);

  const { data, error } = await supabaseAdmin
    .from("fax_messages")
    .select("id")
    .eq("direction", "inbound")
    .eq("is_archived", false)
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (data ?? []).map((r) => r.id as string);
  if (dryRun) {
    return NextResponse.json({ ok: true, dry_run: true, count: ids.length });
  }

  let extracted = 0;
  let skipped = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await extractInboundFaxStructured(id);
    if (result.ok) extracted += 1;
    else if ("skipped" in result && result.skipped) skipped += 1;
    else failed += 1;
  }

  return NextResponse.json({ ok: true, dry_run: false, extracted, skipped, failed, count: ids.length });
}
