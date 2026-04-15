import "server-only";

import type { CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { normalizeRecruitingPhoneForStorage } from "@/lib/recruiting/recruiting-contact-normalize";
import { ensureRecruitingCandidateCrmContact } from "@/lib/recruiting/recruiting-crm-contact-sync";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { isValidE164 } from "@/lib/softphone/phone-number";
import { supabaseAdmin } from "@/lib/admin";
import { pickOutboundE164ForDial } from "@/lib/workspace-phone/launch-urls";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTACT_SELECT =
  "id, first_name, last_name, full_name, primary_phone, secondary_phone, email, contact_type, status" as const;

function rowToMatch(row: Record<string, unknown>): CrmContactMatch {
  return {
    id: String(row.id),
    first_name: typeof row.first_name === "string" ? row.first_name : null,
    last_name: typeof row.last_name === "string" ? row.last_name : null,
    full_name: typeof row.full_name === "string" ? row.full_name : null,
    primary_phone: typeof row.primary_phone === "string" ? row.primary_phone : null,
    secondary_phone: typeof row.secondary_phone === "string" ? row.secondary_phone : null,
    email: typeof row.email === "string" ? row.email : null,
    contact_type: typeof row.contact_type === "string" ? row.contact_type : null,
    status: typeof row.status === "string" ? row.status : null,
  };
}

export type ResolveWorkspaceNewSmsResult =
  | { ok: true; e164: string; contact: CrmContactMatch | null }
  | {
      ok: false;
      error:
        | "bad_phone"
        | "contact_no_phone"
        | "recruit_no_phone"
        | "contact_not_found"
        | "contact_create_failed";
    };

/**
 * Picks E.164 + CRM contact for a net-new workspace SMS using the same matching order as Recruiting ↔ contacts:
 * explicit contact → recruiting candidate → phone lookup → recruit by normalized_phone → create contact.
 */
export async function resolveContactAndPhoneForWorkspaceNewSms(input: {
  phoneRaw: string;
  /** Picked from search — authoritative for which contact / phone to use */
  contactId?: string | null;
  recruitingCandidateId?: string | null;
}): Promise<ResolveWorkspaceNewSmsResult> {
  const contactPick = typeof input.contactId === "string" ? input.contactId.trim() : "";
  const recruitPick = typeof input.recruitingCandidateId === "string" ? input.recruitingCandidateId.trim() : "";
  const phoneRaw = typeof input.phoneRaw === "string" ? input.phoneRaw.trim() : "";

  if (contactPick && UUID_RE.test(contactPick)) {
    const { data: c, error } = await supabaseAdmin
      .from("contacts")
      .select(CONTACT_SELECT)
      .eq("id", contactPick)
      .maybeSingle();
    if (error || !c) {
      return { ok: false, error: "contact_not_found" };
    }
    const e164 = pickOutboundE164ForDial(typeof c.primary_phone === "string" ? c.primary_phone : null);
    if (!e164 || !isValidE164(e164)) {
      return { ok: false, error: "contact_no_phone" };
    }
    return { ok: true, e164, contact: rowToMatch(c as Record<string, unknown>) };
  }

  if (recruitPick && UUID_RE.test(recruitPick)) {
    await ensureRecruitingCandidateCrmContact(supabaseAdmin, recruitPick);
    const { data: cand, error: ge } = await supabaseAdmin
      .from("recruiting_candidates")
      .select("phone, crm_contact_id")
      .eq("id", recruitPick)
      .maybeSingle();
    if (ge || !cand) {
      return { ok: false, error: "recruit_no_phone" };
    }
    const e164 = pickOutboundE164ForDial(typeof cand.phone === "string" ? cand.phone : null);
    if (!e164 || !isValidE164(e164)) {
      return { ok: false, error: "recruit_no_phone" };
    }

    const pc = cand.crm_contact_id != null ? String(cand.crm_contact_id) : "";
    if (pc && UUID_RE.test(pc)) {
      const { data: c } = await supabaseAdmin.from("contacts").select(CONTACT_SELECT).eq("id", pc).maybeSingle();
      if (c) {
        return { ok: true, e164, contact: rowToMatch(c as Record<string, unknown>) };
      }
    }
    const byPhone = await findContactByIncomingPhone(supabaseAdmin, e164);
    return { ok: true, e164, contact: byPhone };
  }

  const e164 = pickOutboundE164ForDial(phoneRaw || null);
  if (!e164 || !isValidE164(e164)) {
    return { ok: false, error: "bad_phone" };
  }

  let contact = await findContactByIncomingPhone(supabaseAdmin, e164);

  if (!contact) {
    const np = normalizeRecruitingPhoneForStorage(phoneRaw);
    if (np) {
      const { data: rc } = await supabaseAdmin
        .from("recruiting_candidates")
        .select("id")
        .eq("normalized_phone", np)
        .limit(1)
        .maybeSingle();
      const rid = rc && typeof (rc as { id?: unknown }).id === "string" ? (rc as { id: string }).id : null;
      if (rid) {
        await ensureRecruitingCandidateCrmContact(supabaseAdmin, rid);
        const { data: cand2 } = await supabaseAdmin
          .from("recruiting_candidates")
          .select("crm_contact_id")
          .eq("id", rid)
          .maybeSingle();
        const cid =
          cand2 && typeof (cand2 as { crm_contact_id?: unknown }).crm_contact_id === "string"
            ? (cand2 as { crm_contact_id: string }).crm_contact_id
            : "";
        if (cid && UUID_RE.test(cid)) {
          const { data: cr } = await supabaseAdmin.from("contacts").select(CONTACT_SELECT).eq("id", cid).maybeSingle();
          if (cr) {
            contact = rowToMatch(cr as Record<string, unknown>);
          }
        }
      }
    }
  }

  if (!contact) {
    const label = formatPhoneForDisplay(e164);
    const { data: created, error: insErr } = await supabaseAdmin
      .from("contacts")
      .insert({
        full_name: label ? `Text · ${label}` : `Text · ${e164}`,
        primary_phone: e164,
        contact_type: "other",
      })
      .select(CONTACT_SELECT)
      .maybeSingle();

    if (insErr || !created) {
      console.warn("[workspace-new-sms] create contact:", insErr?.message);
      return { ok: false, error: "contact_create_failed" };
    }
    contact = rowToMatch(created as Record<string, unknown>);
  }

  return { ok: true, e164, contact };
}
