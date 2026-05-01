import "server-only";

import { supabaseAdmin } from "@/lib/admin";

export type SignEventActor = "recipient" | "staff" | "system";

export async function logSignatureEvent(input: {
  packetId: string;
  recipientId?: string | null;
  actor: SignEventActor;
  actorStaffUserId?: string | null;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  templateVersion?: number | null;
  documentHash?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("signature_events").insert({
    packet_id: input.packetId,
    recipient_id: input.recipientId ?? null,
    actor: input.actor,
    actor_staff_user_id: input.actorStaffUserId ?? null,
    action: input.action,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    template_version: input.templateVersion ?? null,
    document_hash: input.documentHash ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.error("[logSignatureEvent]", error);
  }
}
