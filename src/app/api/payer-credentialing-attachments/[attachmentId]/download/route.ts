import { NextResponse } from "next/server";

import {
  PAYER_CREDENTIALING_STORAGE_BUCKET,
} from "@/lib/crm/payer-credentialing-storage";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, props: { params: Promise<{ attachmentId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { attachmentId } = await props.params;
  const id = typeof attachmentId === "string" ? attachmentId.trim() : "";
  if (!UUID_RE.test(id)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin
    .from("payer_credentialing_attachments")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error || !row || typeof row.storage_path !== "string" || !row.storage_path.trim()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
    .createSignedUrl(row.storage_path.trim(), 60 * 60);

  if (signErr || !signed?.signedUrl) {
    return new NextResponse("Unavailable", { status: 502 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
