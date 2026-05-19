import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { SALES_AGENT_CHAT_ATTACHMENTS_BUCKET } from "@/lib/sales-agent/sales-agent-chat-attachment-constants";
import { getSalesAgentChatAttachmentForDownload } from "@/lib/sales-agent/sales-agent-chat";
import { getStaffProfile, isManagerOrHigher, isSalesAgentRole } from "@/lib/staff-profile";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Short-lived signed URL redirect for sales agent chat attachments (private bucket). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ attachmentId: string }> }
): Promise<Response> {
  const staff = await getStaffProfile();
  if (!staff) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { attachmentId } = await ctx.params;
  const aid = (attachmentId ?? "").trim().toLowerCase();
  if (!aid || !UUID_RE.test(aid)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const row = await getSalesAgentChatAttachmentForDownload(aid);
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isAgentOwnThread = isSalesAgentRole(staff) && row.sales_agent_user_id === staff.user_id;
  const isManager = isManagerOrHigher(staff);
  if (!isAgentOwnThread && !isManager) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (row.storage_bucket !== SALES_AGENT_CHAT_ATTACHMENTS_BUCKET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error: signErr } = await supabaseAdmin.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, 120, row.file_name ? { download: row.file_name } : undefined);

  if (signErr || !data?.signedUrl) {
    console.warn("[sales-agent-chat/attachment] sign_failed");
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl, 302);
}
