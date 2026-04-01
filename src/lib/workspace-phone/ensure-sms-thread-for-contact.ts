import { supabaseAdmin } from "@/lib/admin";

import { pickOutboundE164ForDial } from "@/lib/workspace-phone/launch-urls";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EnsureSmsThreadResult =
  | { ok: true; conversationId: string; created: boolean }
  | { ok: false; error: "bad_contact" | "no_phone" | "persist_failed" };

/**
 * Finds or creates a workspace SMS conversation row for a CRM contact so inbox + Twilio send path can run.
 */
export async function ensureSmsConversationForContact(contactId: string): Promise<EnsureSmsThreadResult> {
  const cid = contactId.trim();
  if (!cid || !UUID_RE.test(cid)) {
    return { ok: false, error: "bad_contact" };
  }

  const { data: contact, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select("id, primary_phone")
    .eq("id", cid)
    .maybeSingle();

  if (cErr || !contact?.id) {
    return { ok: false, error: "bad_contact" };
  }

  const rawPhone = typeof contact.primary_phone === "string" ? contact.primary_phone : null;
  const e164 = pickOutboundE164ForDial(rawPhone);
  if (!e164) {
    return { ok: false, error: "no_phone" };
  }

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("channel", "sms")
    .eq("primary_contact_id", cid)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.warn("[ensureSmsConversationForContact] find:", findErr.message);
  }

  if (existing?.id) {
    return { ok: true, conversationId: String(existing.id), created: false };
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("conversations")
    .insert({
      channel: "sms",
      primary_contact_id: cid,
      main_phone_e164: e164,
      metadata: { provisioned_from: "workspace_sms_to_contact" },
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.warn("[ensureSmsConversationForContact] insert:", insErr?.message);
    return { ok: false, error: "persist_failed" };
  }

  return { ok: true, conversationId: String(inserted.id), created: true };
}
