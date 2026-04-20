import type { InboundEmailChannelKey } from "./types";

export const INBOUND_EMAIL_DOMAIN = "saintlyhomehealth.com";

/** Lowercased local-part → channel (recipient alias). */
export const INBOUND_EMAIL_ALIAS_TO_CHANNEL: Record<string, InboundEmailChannelKey> = {
  referrals: "referrals",
  care: "care",
  join: "join",
  billing: "billing",
};

export function canonicalAliasEmail(localPart: string): string {
  return `${localPart.trim().toLowerCase()}@${INBOUND_EMAIL_DOMAIN}`;
}
