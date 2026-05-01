import { NextResponse } from "next/server";

import {
  PAYER_CREDENTIALING_STORAGE_BUCKET,
} from "@/lib/crm/payer-credentialing-storage";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDownloadFileName(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().slice(0, 200);
  if (!t) return undefined;
  return t.replace(/[^\w.\- ()+,@\[\]]+/g, "_") || "attachment";
}

export async function GET(req: Request, props: { params: Promise<{ attachmentId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { attachmentId } = await props.params;
  const id = typeof attachmentId === "string" ? attachmentId.trim() : "";
  if (!UUID_RE.test(id)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const url = new URL(req.url);
  const forceDownload =
    url.searchParams.get("download") === "1" || url.searchParams.get("download") === "true";

  const { data: row, error } = await supabaseAdmin
    .from("payer_credentialing_attachments")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();

  if (error || !row || typeof row.storage_path !== "string" || !row.storage_path.trim()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const path = row.storage_path.trim();
  const dlName = forceDownload ? safeDownloadFileName(row.file_name as string | undefined) : undefined;

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60, dlName ? { download: dlName } : undefined);

  if (signErr || !signed?.signedUrl) {
    return new NextResponse("Unavailable", { status: 502 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
