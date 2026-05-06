import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { LEAD_ATTACHMENTS_BUCKET } from "@/lib/crm/lead-attachments-constants";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDownloadFileName(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().slice(0, 200);
  if (!t) return undefined;
  return t.replace(/[^\w.\- ()+,@\[\]]+/g, "_") || "attachment";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ leadId: string; attachmentId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { leadId, attachmentId } = await ctx.params;
  const lid = typeof leadId === "string" ? leadId.trim() : "";
  const aid = typeof attachmentId === "string" ? attachmentId.trim() : "";
  if (!UUID_RE.test(lid) || !UUID_RE.test(aid)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const url = new URL(req.url);
  const forceDownload =
    url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true";

  const { data: row, error } = await supabaseAdmin
    .from("lead_attachments")
    .select("lead_id, file_path, file_name")
    .eq("id", aid)
    .eq("lead_id", lid)
    .maybeSingle();

  if (error || !row || typeof row.file_path !== "string" || !row.file_path.trim()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const path = row.file_path.trim();
  const dlName = forceDownload ? safeDownloadFileName(row.file_name as string | undefined) : undefined;

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(LEAD_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 60 * 60, dlName ? { download: dlName } : undefined);

  if (signErr || !signed?.signedUrl) {
    return new NextResponse("Unavailable", { status: 502 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
