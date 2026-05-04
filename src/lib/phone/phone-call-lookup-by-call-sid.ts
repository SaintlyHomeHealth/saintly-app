import type { SupabaseClient } from "@supabase/supabase-js";
import twilio from "twilio";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export type PhoneCallRowLookup = {
  id: string;
  /** Canonical row key — parent inbound leg for PSTN→browser; may differ from the Client leg CallSid. */
  external_call_id: string;
  from_e164: string | null;
  metadata: Record<string, unknown>;
  started_at: string | null;
};

/** How the row was tied to the CallSid Twilio / the browser sent. */
export type PhoneCallSidMatchReason =
  | "external_call_id"
  | "twilio_leg_map.last_leg_call_sid"
  | "twilio_leg_map.parent_call_sid"
  | "softphone_conference.pstn_call_sid"
  | "twilio_rest_parent_external_call_id"
  | null;

const ROW_SELECT = "id, metadata, external_call_id, from_e164, started_at";

/**
 * PostgREST `.or()` filter: same shapes as `findPhoneCallRowForTwilioStatus` in log-call (parent/child legs).
 * Keep in sync with {@link findPhoneCallRowByTwilioCallSidDetailed}.
 */
export function buildPhoneCallOrFilterForTwilioSid(callSid: string): string {
  const sid = callSid.trim();
  if (!sid.startsWith("CA")) return "";
  return [
    `external_call_id.eq.${sid}`,
    `metadata->twilio_leg_map->>last_leg_call_sid.eq.${sid}`,
    `metadata->twilio_leg_map->>parent_call_sid.eq.${sid}`,
    `metadata->softphone_conference->>pstn_call_sid.eq.${sid}`,
  ].join(",");
}

function inferMatchReason(
  row: { external_call_id: string; metadata: Record<string, unknown> },
  lookupSid: string
): PhoneCallSidMatchReason {
  if (row.external_call_id === lookupSid) return "external_call_id";
  const lm = row.metadata?.twilio_leg_map;
  if (lm && typeof lm === "object" && !Array.isArray(lm)) {
    const m = lm as Record<string, unknown>;
    if (typeof m.last_leg_call_sid === "string" && m.last_leg_call_sid === lookupSid) {
      return "twilio_leg_map.last_leg_call_sid";
    }
    if (typeof m.parent_call_sid === "string" && m.parent_call_sid === lookupSid) {
      return "twilio_leg_map.parent_call_sid";
    }
  }
  const sc = row.metadata?.softphone_conference;
  if (sc && typeof sc === "object" && !Array.isArray(sc)) {
    const p = (sc as Record<string, unknown>).pstn_call_sid;
    if (typeof p === "string" && p === lookupSid) return "softphone_conference.pstn_call_sid";
  }
  return null;
}

function rowFromData(data: Record<string, unknown>, lookupSid: string): {
  row: PhoneCallRowLookup;
  match: PhoneCallSidMatchReason;
} {
  const sid = lookupSid.trim();
  const meta = asRecord(data.metadata);
  const row: PhoneCallRowLookup = {
    id: data.id as string,
    external_call_id: typeof data.external_call_id === "string" ? data.external_call_id : sid,
    from_e164: typeof data.from_e164 === "string" ? data.from_e164 : null,
    metadata: meta,
    started_at: typeof data.started_at === "string" ? data.started_at : null,
  };
  return { row, match: inferMatchReason(row, sid) };
}

/**
 * Resolve `phone_calls` by Twilio CallSid: OR match on `external_call_id`, leg map,
 * `softphone_conference.pstn_call_sid`, then Twilio REST parent fallback (same idea as `findPhoneCallRowForTwilioStatus`).
 */
export type FindPhoneCallLookupOptions = {
  /** Verbose `[phone_call_lookup]` logs (use from start-transcript / support). Default false for hot paths (transcript chunks). */
  logLookup?: boolean;
  /** Skip Twilio REST parent lookup (call-context polling — avoid extra latency / timeouts). */
  skipTwilioRestFallback?: boolean;
};

export async function findPhoneCallRowByTwilioCallSidDetailed(
  supabase: SupabaseClient,
  callSid: string,
  options?: FindPhoneCallLookupOptions
): Promise<{ row: PhoneCallRowLookup | null; match: PhoneCallSidMatchReason; lookup_path: string }> {
  const log = Boolean(options?.logLookup);
  const sid = callSid.trim();
  if (!sid.startsWith("CA")) {
    return { row: null, match: null, lookup_path: "invalid_sid" };
  }

  const orFilter = buildPhoneCallOrFilterForTwilioSid(sid);
  if (log) {
    console.warn(
      "[phone_call_lookup]",
      JSON.stringify({
        step: "phone_call_lookup_or_query",
        call_sid: `${sid.slice(0, 10)}…`,
        or_filter_fields: [
          "external_call_id",
          "twilio_leg_map.last_leg_call_sid",
          "twilio_leg_map.parent_call_sid",
          "softphone_conference.pstn_call_sid",
        ],
      })
    );
  }

  const { data, error } = await supabase
    .from("phone_calls")
    .select(ROW_SELECT)
    .or(orFilter)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && log) {
    console.warn("[phone_call_lookup]", JSON.stringify({ step: "phone_call_lookup_or_query_error", message: error.message }));
  }

  if (data?.id) {
    const { row, match } = rowFromData(data as Record<string, unknown>, sid);
    if (log) {
      console.warn(
        "[phone_call_lookup]",
        JSON.stringify({
          step: "phone_call_lookup_matched",
          call_sid: `${sid.slice(0, 10)}…`,
          phone_call_id: row.id,
          external_call_id: `${row.external_call_id.slice(0, 10)}…`,
          match_reason: match,
          lookup_path: "supabase_or",
        })
      );
    }
    return { row, match, lookup_path: "supabase_or" };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!options?.skipTwilioRestFallback && accountSid && authToken) {
    try {
      const client = twilio(accountSid, authToken);
      const callResource = await client.calls(sid).fetch();
      const parentSid = callResource.parentCallSid?.trim();
      if (parentSid && parentSid.startsWith("CA") && parentSid !== sid) {
        if (log) {
          console.warn(
            "[phone_call_lookup]",
            JSON.stringify({
              step: "phone_call_lookup_twilio_parent_fetch",
              child_call_sid: `${sid.slice(0, 10)}…`,
              parent_call_sid: `${parentSid.slice(0, 10)}…`,
            })
          );
        }
        const { data: byParent, error: e2 } = await supabase
          .from("phone_calls")
          .select(ROW_SELECT)
          .eq("external_call_id", parentSid)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (e2 && log) {
          console.warn("[phone_call_lookup]", JSON.stringify({ step: "phone_call_lookup_parent_query_error", message: e2.message }));
        }
        if (byParent?.id) {
          const { row } = rowFromData(byParent as Record<string, unknown>, sid);
          if (log) {
            console.warn(
              "[phone_call_lookup]",
              JSON.stringify({
                step: "phone_call_lookup_matched",
                call_sid: `${sid.slice(0, 10)}…`,
                phone_call_id: row.id,
                external_call_id: `${row.external_call_id.slice(0, 10)}…`,
                match_reason: "twilio_rest_parent_external_call_id",
                lookup_path: "twilio_rest_parent",
              })
            );
          }
          return { row, match: "twilio_rest_parent_external_call_id", lookup_path: "twilio_rest_parent" };
        }
      }
    } catch (e) {
      if (log) {
        console.warn(
          "[phone_call_lookup]",
          JSON.stringify({
            step: "phone_call_lookup_twilio_fetch_failed",
            message: e instanceof Error ? e.message : String(e),
          })
        );
      }
    }
  }

  if (log) {
    console.warn(
      "[phone_call_lookup]",
      JSON.stringify({
        step: "phone_call_lookup_not_found",
        call_sid: `${sid.slice(0, 10)}…`,
        lookup_path: "exhausted",
      })
    );
  }
  return { row: null, match: null, lookup_path: "exhausted" };
}

/**
 * Resolve `phone_calls` by Twilio CallSid (legacy API — returns row only).
 */
export async function findPhoneCallRowByTwilioCallSid(
  supabase: SupabaseClient,
  callSid: string,
  options?: FindPhoneCallLookupOptions
): Promise<PhoneCallRowLookup | null> {
  const { row } = await findPhoneCallRowByTwilioCallSidDetailed(supabase, callSid, {
    logLookup: false,
    ...options,
  });
  return row;
}
