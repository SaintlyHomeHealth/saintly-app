import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { invalidateAllRecipientSigningLinksForPacket } from "@/lib/pdf-sign/invalidate-signing-links";
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

  let body: { cancel_reason?: string } = {};
  try {
    body = (await request.json()) as { cancel_reason?: string };
  } catch {
    /* allow empty */
  }
  const cancel_reason = body.cancel_reason?.trim() || null;

  const { data: current } = await supabaseAdmin
    .from("signature_packets")
    .select("id, status")
    .eq("id", packetId)
    .maybeSingle();

  if (!current) return NextResponse.json({ error: "Packet not found." }, { status: 404 });

  if (current.status === "completed" || current.status === "signed") {
    return NextResponse.json(
      { error: "Completed packets cannot be canceled. Remove from list instead." },
      { status: 409 }
    );
  }
  if (current.status === "canceled") {
    return NextResponse.json({ ok: true, already: true });
  }

  const now = new Date().toISOString();
  const cancellableStatuses = ["sent", "viewed", "in_progress"];

  const { data: updated, error } = await supabaseAdmin
    .from("signature_packets")
    .update({
      status: "canceled",
      canceled_at: now,
      canceled_by: user.id,
      cancel_reason,
      updated_at: now,
    })
    .eq("id", packetId)
    .in("status", cancellableStatuses)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      {
        error:
          "This packet cannot be canceled in its current state. Use void for drafts, or remove from list.",
      },
      { status: 409 }
    );
  }

  await invalidateAllRecipientSigningLinksForPacket(packetId);

  await logSignatureEvent({
    packetId,
    actor: "staff",
    actorStaffUserId: user.id,
    action: "cancel",
    metadata: { cancel_reason },
  });
  await insertAuditLogTrusted({
    action: "pdf_sign_packet_canceled",
    entityType: "signature_packet",
    entityId: packetId,
    metadata: { cancel_reason },
  });

  return NextResponse.json({ ok: true });
}
