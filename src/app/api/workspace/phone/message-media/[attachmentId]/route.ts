import { NextResponse } from "next/server";

import { PHONE_MESSAGE_MEDIA_BUCKET } from "@/lib/phone/phone-message-media-bucket";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Short-lived signed URL redirect for MMS stored in private `phone-message-media` bucket. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ attachmentId: string }> }
): Promise<Response> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { attachmentId } = await ctx.params;
  const aid = (attachmentId ?? "").trim().toLowerCase();
  if (!aid || !UUID_RE.test(aid)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const supabaseUser = await createServerSupabaseClient();
  const { data: row, error } = await supabaseUser
    .from("phone_message_attachments")
    .select("id, storage_path, storage_bucket")
    .eq("id", aid)
    .maybeSingle();

  if (error || !row?.storage_path || !row.storage_bucket) {
    if (process.env.NODE_ENV === "development" && error?.message) {
      console.warn("[message-media]", error.message);
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bucket = String(row.storage_bucket);
  if (bucket !== PHONE_MESSAGE_MEDIA_BUCKET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const path = String(row.storage_path);
  const { data, error: signErr } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 120);

  if (signErr || !data?.signedUrl) {
    console.warn("[message-media] sign_failed:", signErr?.message);
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl, 302);
}
