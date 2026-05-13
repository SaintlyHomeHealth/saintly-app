import "server-only";

import crypto from "crypto";

import { supabaseAdmin } from "@/lib/admin";
import { hashSignToken } from "@/lib/pdf-sign/token";

/**
 * Recipient rows are keyed by hashed token — rotate each recipient's hash and
 * force expiry so any existing URL becomes unusable immediately.
 */
export async function invalidateAllRecipientSigningLinksForPacket(packetId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from("signature_recipients")
    .select("id")
    .eq("packet_id", packetId);

  const pastIso = new Date(0).toISOString();

  for (const r of rows ?? []) {
    const raw = crypto.randomUUID() + "/" + crypto.randomUUID();
    const token_hash = hashSignToken(raw);
    await supabaseAdmin
      .from("signature_recipients")
      .update({ token_hash, token_expires_at: pastIso })
      .eq("id", r.id);
  }
}
