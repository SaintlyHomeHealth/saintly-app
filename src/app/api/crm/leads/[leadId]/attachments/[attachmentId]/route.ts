import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { LEAD_ATTACHMENTS_BUCKET } from "@/lib/crm/lead-attachments-constants";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ leadId: string; attachmentId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" as const }, { status: 403 });
  }

  const { leadId, attachmentId } = await ctx.params;
  const lid = typeof leadId === "string" ? leadId.trim() : "";
  const aid = typeof attachmentId === "string" ? attachmentId.trim() : "";
  if (!UUID_RE.test(lid) || !UUID_RE.test(aid)) {
    return NextResponse.json({ ok: false, error: "invalid_id" as const }, { status: 400 });
  }

  const { data: row, error: selErr } = await supabaseAdmin
    .from("lead_attachments")
    .select("file_path")
    .eq("id", aid)
    .eq("lead_id", lid)
    .maybeSingle();

  if (selErr || !row || typeof row.file_path !== "string" || !row.file_path.trim()) {
    return NextResponse.json({ ok: false, error: "not_found" as const }, { status: 404 });
  }

  const path = row.file_path.trim();

  const { error: stErr } = await supabaseAdmin.storage.from(LEAD_ATTACHMENTS_BUCKET).remove([path]);
  if (stErr) {
    console.warn("[lead attachments] storage remove failed (row kept):", stErr.message, path);
    return NextResponse.json({ ok: false, error: "storage_delete_failed" as const }, { status: 503 });
  }

  const { error: delErr } = await supabaseAdmin.from("lead_attachments").delete().eq("id", aid).eq("lead_id", lid);
  if (delErr) {
    console.warn("[lead attachments] delete row after storage removed:", delErr.message, path);
    return NextResponse.json({ ok: false, error: "metadata_delete_failed" as const }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const });
}
