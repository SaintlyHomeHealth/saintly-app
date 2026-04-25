"use server";

import { loadWorkspaceSmsThreadBootstrap, type WorkspaceSmsThreadBootstrap } from "@/lib/phone/workspace-sms-thread-bootstrap";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { ensureSmsConversationForContact } from "@/lib/workspace-phone/ensure-sms-thread-for-contact";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LoadLeadSmsThreadBootstrapResult =
  | { ok: true; data: WorkspaceSmsThreadBootstrap }
  | { ok: false; error: string };

export async function loadLeadSmsThreadBootstrapAction(
  conversationId: string
): Promise<LoadLeadSmsThreadBootstrapResult> {
  return loadWorkspaceSmsThreadBootstrap(conversationId);
}

export async function ensureLeadSmsThreadAction(
  contactId: string
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "You do not have access to workspace phone." };
  }

  const cid = contactId.trim();
  if (!cid || !UUID_RE.test(cid)) {
    return { ok: false, error: "Invalid contact." };
  }

  const r = await ensureSmsConversationForContact(cid);
  if (!r.ok) {
    if (r.error === "no_phone") {
      return { ok: false, error: "Add a valid primary phone on the contact before texting." };
    }
    if (r.error === "bad_contact") {
      return { ok: false, error: "Contact not found." };
    }
    return { ok: false, error: "Could not start the SMS thread. Try again." };
  }

  return { ok: true, conversationId: r.conversationId };
}
