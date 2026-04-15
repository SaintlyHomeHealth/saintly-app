import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolves CRM `contacts.primary_phone` to an E.164 value the softphone can dial.
 */
export function pickOutboundE164ForDial(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  if (isValidE164(t)) return t;
  const n = normalizeDialInputToE164(t);
  if (n && isValidE164(n)) return n;
  for (const c of phoneLookupCandidates(t)) {
    if (isValidE164(c)) return c;
    const n2 = normalizeDialInputToE164(c);
    if (n2 && isValidE164(n2)) return n2;
  }
  return null;
}

export type WorkspaceKeypadLaunch = {
  /** E.164 or normalizable dial string (prefer E.164 from `pickOutboundE164ForDial`). */
  dial: string;
  placeCall?: boolean;
  leadId?: string;
  contactId?: string;
  contextName?: string;
  /** Admin recruiting candidate — deep-links keypad banner back to `/admin/recruiting/:id`. */
  candidateId?: string;
  /** Short source tag for keypad UI (e.g. `recruiting`). */
  source?: string;
};

/** Twilio softphone keypad (never `tel:`). */
export function buildWorkspaceKeypadCallHref(opts: WorkspaceKeypadLaunch): string {
  const q = new URLSearchParams();
  q.set("dial", opts.dial);
  if (opts.placeCall !== false) {
    q.set("place", "1");
  }
  if (opts.leadId && UUID_RE.test(opts.leadId)) {
    q.set("leadId", opts.leadId);
  }
  if (opts.contactId && UUID_RE.test(opts.contactId)) {
    q.set("contactId", opts.contactId);
  }
  const name = (opts.contextName ?? "").trim();
  if (name) {
    q.set("contextName", name.slice(0, 120));
  }
  if (opts.candidateId && UUID_RE.test(opts.candidateId)) {
    q.set("candidateId", opts.candidateId);
  }
  const src = (opts.source ?? "").trim();
  if (src && /^[a-z][a-z0-9_-]{0,30}$/i.test(src)) {
    q.set("source", src.slice(0, 32));
  }
  return `/workspace/phone/keypad?${q.toString()}`;
}

/**
 * Admin call log page embeds `SoftphoneDialer` with the same `dial` / `place` query contract as the workspace keypad
 * (Twilio in-app — never `tel:`). Use when the viewer can use the phone stack but not `/workspace/phone` (e.g. manager
 * without `phone_access_enabled`).
 */
export function buildAdminPhoneCallsSoftphoneHref(opts: {
  dial: string;
  placeCall?: boolean;
}): string {
  const q = new URLSearchParams();
  q.set("dial", opts.dial.trim());
  if (opts.placeCall !== false) {
    q.set("place", "1");
  }
  return `/admin/phone/calls?${q.toString()}`;
}

export type WorkspaceSmsLaunch = {
  contactId: string;
  leadId?: string;
};

/** Server route that ensures an SMS thread exists, then redirects into workspace inbox. */
export function buildWorkspaceSmsToContactHref(opts: WorkspaceSmsLaunch): string {
  const q = new URLSearchParams();
  q.set("contactId", opts.contactId);
  if (opts.leadId && UUID_RE.test(opts.leadId)) {
    q.set("leadId", opts.leadId);
  }
  return `/workspace/phone/sms-to-contact?${q.toString()}`;
}
