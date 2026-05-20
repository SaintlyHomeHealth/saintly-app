import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { buildContactSearchOrClauseMulti, escapeForIlike } from "@/lib/crm/crm-leads-search";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";

/** Cap UUID buckets embedded in `.or(...)` so filter strings stay within practical URI limits. */
export const ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP = 120;

/**
 * When `q` equals a short payer alias (whole query, case-insensitive), search these phrases instead.
 * Covers timeline/payer fields via expanded ILIKE ORs.
 */
const PAYER_KEYWORD_SYNONYM_GROUPS: ReadonlyArray<{ aliases: readonly string[]; phrases: readonly string[] }> = [
  {
    aliases: ["uhc"],
    phrases: ["UHC", "UnitedHealthcare", "United Healthcare", "UnitedHealth"],
  },
  {
    aliases: ["bcbs"],
    phrases: ["BCBS", "Blue Cross", "Blue Shield", "Arizona Blue"],
  },
  {
    aliases: ["ahcccs"],
    phrases: ["AHCCCS", "Medicaid"],
  },
  {
    aliases: ["ma"],
    phrases: ["MA", "Medicare Advantage"],
  },
];

/** Whole-query aliases only — avoids treating "Mary" as Medicare Advantage. */
export function expandLeadKeywordSearchTerms(qRaw: string): string[] {
  const q = qRaw.trim().slice(0, 120);
  if (!q) return [];

  const lower = q.toLowerCase();
  for (const group of PAYER_KEYWORD_SYNONYM_GROUPS) {
    if (group.aliases.some((a) => lower === a)) {
      return [...new Set(group.phrases.map((p) => p.trim()).filter(Boolean))];
    }
  }

  return [q];
}

function bodyIlikeOrClause(searchTerms: readonly string[]): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const t of searchTerms) {
    const esc = escapeForIlike(t.trim());
    if (!esc) continue;
    const frag = `body.ilike.%${esc}%`;
    if (seen.has(frag)) continue;
    seen.add(frag);
    parts.push(frag);
  }
  return parts.length > 0 ? parts.join(",") : null;
}

const LEAD_KEYWORD_ILIKE_COLUMNS = [
  "payer_name",
  "primary_payer_name",
  "secondary_payer_name",
  "payer_type",
  "primary_payer_type",
  "secondary_payer_type",
  "referring_provider_name",
  "insurance_name",
  "last_note",
  "notes",
] as const;

/**
 * Builds the inner expression passed to `.or(...)` on `leads` when URL `q` is non-empty.
 * Any truthy clause matches (contact tied to keyword hits, timeline hits, payer/note columns).
 */
export function buildKeywordLeadSearchOrClause(input: {
  searchTerms: readonly string[];
  contactIds: string[];
  timelineLeadIds: string[];
  producedBySalesAgentIds?: string[];
}): string {
  const parts: string[] = [];
  const { searchTerms, contactIds, timelineLeadIds, producedBySalesAgentIds = [] } = input;

  if (contactIds.length > 0) {
    parts.push(`contact_id.in.(${contactIds.join(",")})`);
  }
  if (timelineLeadIds.length > 0) {
    parts.push(`id.in.(${timelineLeadIds.join(",")})`);
  }
  if (producedBySalesAgentIds.length > 0) {
    parts.push(`produced_by_sales_agent_id.in.(${producedBySalesAgentIds.join(",")})`);
  }

  const escapedTerms = [...new Set(searchTerms.map((t) => escapeForIlike(t.trim())).filter(Boolean))];
  for (const col of LEAD_KEYWORD_ILIKE_COLUMNS) {
    for (const esc of escapedTerms) {
      parts.push(`${col}.ilike.%${esc}%`);
    }
  }

  return parts.join(",");
}

async function resolveSalesAgentUserIdsFromKeyword(
  supabase: SupabaseClient,
  searchTerms: readonly string[]
): Promise<string[]> {
  const escapedTerms = [...new Set(searchTerms.map((t) => escapeForIlike(t.trim())).filter(Boolean))];
  if (escapedTerms.length === 0) return [];

  const orParts: string[] = [];
  for (const esc of escapedTerms) {
    orParts.push(`full_name.ilike.%${esc}%`);
    orParts.push(`email.ilike.%${esc}%`);
  }
  const orClause = orParts.join(",");
  if (!orClause) return [];

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("user_id")
    .eq("role", "sales_agent")
    .or(orClause)
    .limit(ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP);

  if (error) {
    console.warn("[crm/leads] keyword search sales agents:", error.message);
    return [];
  }

  return [...new Set((data ?? []).map((r) => String((r as { user_id?: unknown }).user_id ?? "").trim()).filter(Boolean))].slice(
    0,
    ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP
  );
}

export async function resolveAdminCrmLeadsKeywordLeadSearchOr(
  supabase: SupabaseClient,
  qRaw: string
): Promise<string | null> {
  const q = qRaw.trim().slice(0, 120);
  if (!q) return null;

  const searchTerms = expandLeadKeywordSearchTerms(qRaw);
  if (searchTerms.length === 0) return null;

  const activityBodyOr = bodyIlikeOrClause(searchTerms);
  const messageBodyOr = bodyIlikeOrClause(searchTerms);

  const contactOr = buildContactSearchOrClauseMulti(searchTerms);
  const contactPromise = contactOr
    ? contactRowsActiveOnly(
        supabase.from("contacts").select("id").or(contactOr).limit(ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP)
      ).then(({ data, error }) => {
        if (error) {
          console.warn("[crm/leads] keyword search contacts:", error.message);
          return [] as string[];
        }
        return [...new Set((data ?? []).map((h) => String(h.id)).filter(Boolean))];
      })
    : Promise.resolve([] as string[]);

  const activitiesPromise =
    activityBodyOr !== null
      ? supabase
          .from("lead_activities")
          .select("lead_id")
          .is("deleted_at", null)
          .or(activityBodyOr)
          .limit(ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP)
          .then(({ data, error }) => {
            if (error) {
              if (!isMissingSchemaObjectError(error)) {
                console.warn("[crm/leads] keyword search lead_activities:", error.message);
              }
              return [] as string[];
            }
            return [
              ...new Set(
                (data ?? [])
                  .map((r) => String((r as { lead_id?: unknown }).lead_id ?? "").trim())
                  .filter(Boolean)
              ),
            ].slice(0, ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP);
          })
      : Promise.resolve([] as string[]);

  const smsContactsPromise =
    messageBodyOr !== null
      ? supabase
          .from("messages")
          .select("conversation_id")
          .is("deleted_at", null)
          .or(messageBodyOr)
          .limit(ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP)
          .then(async ({ data, error }) => {
            if (error) {
              if (!isMissingSchemaObjectError(error)) {
                console.warn("[crm/leads] keyword search messages:", error.message);
              }
              return [] as string[];
            }
            const convIds = [
              ...new Set(
                (data ?? [])
                  .map((r) => String((r as { conversation_id?: unknown }).conversation_id ?? "").trim())
                  .filter(Boolean)
              ),
            ];
            if (convIds.length === 0) return [] as string[];

            const { data: convRows, error: convErr } = await supabase
              .from("conversations")
              .select("primary_contact_id")
              .eq("channel", "sms")
              .in("id", convIds)
              .is("deleted_at", null);

            if (convErr) {
              if (!isMissingSchemaObjectError(convErr)) {
                console.warn("[crm/leads] keyword search conversations:", convErr.message);
              }
              return [] as string[];
            }

            return [
              ...new Set(
                (convRows ?? [])
                  .map((r) => String((r as { primary_contact_id?: unknown }).primary_contact_id ?? "").trim())
                  .filter(Boolean)
              ),
            ].slice(0, ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP);
          })
      : Promise.resolve([] as string[]);

  const salesAgentIdsPromise = resolveSalesAgentUserIdsFromKeyword(supabase, searchTerms);

  const [contactIdsBase, timelineLeadIds, smsContactIds, producedBySalesAgentIds] = await Promise.all([
    contactPromise,
    activitiesPromise,
    smsContactsPromise,
    salesAgentIdsPromise,
  ]);

  const contactIds = [...new Set([...contactIdsBase, ...smsContactIds])].slice(
    0,
    ADMIN_CRM_LEADS_KEYWORD_ID_BUCKET_CAP
  );

  const orClause = buildKeywordLeadSearchOrClause({
    searchTerms,
    contactIds,
    timelineLeadIds,
    producedBySalesAgentIds,
  });
  return orClause.trim() ? orClause : null;
}
