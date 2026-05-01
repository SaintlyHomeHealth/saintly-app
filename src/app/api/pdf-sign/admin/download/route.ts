import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const packetDocumentId = url.searchParams.get("packetDocumentId")?.trim();
  if (!packetDocumentId) {
    return NextResponse.json({ error: "Missing packetDocumentId" }, { status: 400 });
  }

  const { data: doc, error } = await supabaseAdmin
    .from("signature_packet_documents")
    .select("id, completed_storage_bucket, completed_storage_path, template_version_snapshot, packet_id")
    .eq("id", packetDocumentId)
    .maybeSingle();

  if (error || !doc?.completed_storage_path || !doc.completed_storage_bucket) {
    return NextResponse.json({ error: "Completed document not found." }, { status: 404 });
  }

  const { data: packetRow } = await supabaseAdmin
    .from("signature_packets")
    .select("primary_document_type")
    .eq("id", doc.packet_id)
    .maybeSingle();

  const bucket = doc.completed_storage_bucket;
  const primaryType = packetRow?.primary_document_type ?? null;

  if (bucket === "i9-documents" && !isAdminOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(doc.completed_storage_path, 120);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message || "Could not sign URL." }, { status: 500 });
  }

  await logSignatureEvent({
    packetId: doc.packet_id,
    recipientId: null,
    actor: "staff",
    actorStaffUserId: user.id,
    action: "download",
    templateVersion: doc.template_version_snapshot,
    metadata: { packet_document_id: doc.id, primary_document_type: primaryType },
  });

  return NextResponse.redirect(signed.signedUrl);
}
