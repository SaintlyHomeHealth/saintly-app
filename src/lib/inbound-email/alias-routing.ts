import { INBOUND_EMAIL_ALIAS_TO_CHANNEL, INBOUND_EMAIL_DOMAIN } from "./constants";
import type { InboundEmailChannelKey } from "./types";

/** Bare email or `Name <email@host>`. */
function extractEmailFromRecipient(addr: string): string {
  const t = String(addr ?? "").trim();
  const m = t.match(/<([^>]+@[^>]+)>/);
  if (m?.[1]) return m[1].trim().toLowerCase();
  return t.replace(/^</, "").replace(/>$/, "").trim().toLowerCase();
}

/**
 * Pick channel from `To` list using @saintlyhomehealth.com aliases.
 * First matching alias wins. Returns null if none matched.
 */
export function resolveInboundChannelFromToEmails(toEmails: string[]): InboundEmailChannelKey | null {
  for (const raw of toEmails) {
    const a = extractEmailFromRecipient(raw);
    const at = a.lastIndexOf("@");
    if (at <= 0) continue;
    const host = a.slice(at + 1);
    const local = a.slice(0, at);
    if (host !== INBOUND_EMAIL_DOMAIN) continue;
    const ch = INBOUND_EMAIL_ALIAS_TO_CHANNEL[local];
    if (ch) return ch;
  }
  return null;
}
