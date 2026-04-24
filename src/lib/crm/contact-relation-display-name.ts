import { buildIncomingContactDisplayName } from "@/lib/crm/incoming-caller-lookup";

type ContactRelEmbed = {
  full_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  organization_name?: unknown;
};

/**
 * Display label from a PostgREST `contacts (...)` embed (single object or one-element array).
 * Includes organization_name (company) like inbound CRM resolution.
 */
export function displayNameFromContactsRelation(raw: unknown): string | null {
  let emb: ContactRelEmbed | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    emb = raw as ContactRelEmbed;
  } else if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object") {
    emb = raw[0] as ContactRelEmbed;
  }
  if (!emb) return null;
  return buildIncomingContactDisplayName({
    full_name: typeof emb.full_name === "string" ? emb.full_name : null,
    first_name: typeof emb.first_name === "string" ? emb.first_name : null,
    last_name: typeof emb.last_name === "string" ? emb.last_name : null,
    organization_name: typeof emb.organization_name === "string" ? emb.organization_name : null,
    primary_phone: null,
    secondary_phone: null,
  });
}
