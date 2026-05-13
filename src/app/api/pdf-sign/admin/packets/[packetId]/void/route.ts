import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export async function POST(
  request: Request,
  context: { params: Promise<{ packetId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { packetId } = await context.params;
  if (!packetId) return NextResponse.json({ error: "Missing packet id" }, { status: 400 });

  let body: { reason?: string } = {};
  try {
    body = (await request.json()) as { reason?: string };
  } catch {
    /* allow empty body */
  }
  const reason = body.reason?.trim() || null;

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("signature_packets")
    .update({ status: "voided", voided_at: now, void_reason: reason, updated_at: now })
    .eq("id", packetId)
    .in("status", ["draft", "sent", "viewed", "in_progress"])
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      {
        error:
          "This packet cannot be voided. It may already be completed, expired, or voided.",
      },
      { status: 409 }
    );
  }

  await logSignatureEvent({
    packetId,
    actor: "staff",
    actorStaffUserId: user.id,
    action: "void",
    metadata: { reason },
  });
  await insertAuditLogTrusted({
    action: "pdf_sign_packet_voided",
    entityType: "signature_packet",
    entityId: packetId,
    metadata: { reason },
  });

  return NextResponse.json({ ok: true });
}
