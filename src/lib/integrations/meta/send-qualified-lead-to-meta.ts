/**
 * Sends a QualifiedLead event to Meta Conversions API when CRM marks a lead qualified
 * and we have a Facebook click id. Unqualified leads are never sent.
 *
 * Returns a result object; never throws. Callers must not fail CRM updates when Meta fails.
 */

export type SendQualifiedLeadToMetaInput = {
  id: string;
  fbclid: string | null | undefined;
  lead_quality: string | null | undefined;
};

export type SendQualifiedLeadToMetaResult = {
  ok: boolean;
  status?: number;
  responseText?: string;
  skipped?: boolean;
  reason?: string;
};

const GRAPH_VERSION = "v23.0";
const TIMEOUT_MS = 20000;
const EVENT_SOURCE_URL = "https://www.appsaintlyhomehealth.com";

/**
 * Meta CAPI expects `user_data.fbc`, not raw `fbclid`. Format:
 * `fb.1.<unix_timestamp_ms>.<fbclid>` (click id from the lead row).
 */
export function buildFbcFromStoredFbclid(fbclid: string): string {
  const unixTimestampMs = Date.now();
  return `fb.1.${unixTimestampMs}.${fbclid}`;
}

export async function sendQualifiedLeadToMeta(
  input: SendQualifiedLeadToMetaInput
): Promise<SendQualifiedLeadToMetaResult> {
  const lead_quality = input.lead_quality;
  const fbRaw = typeof input.fbclid === "string" ? input.fbclid.trim() : "";

  if (lead_quality !== "qualified") {
    return { ok: true, skipped: true, reason: "not_qualified" };
  }

  if (!fbRaw) {
    return { ok: true, skipped: true, reason: "missing_fbclid" };
  }

  const datasetId = process.env.META_DATASET_ID?.trim();
  const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN?.trim();

  if (!datasetId) {
    return { ok: true, skipped: true, reason: "missing_META_DATASET_ID" };
  }

  if (!accessToken) {
    return { ok: true, skipped: true, reason: "missing_META_CONVERSIONS_ACCESS_TOKEN" };
  }

  const leadId = typeof input.id === "string" ? input.id.trim() : "";
  if (!leadId) {
    return { ok: true, skipped: true, reason: "empty_lead_id" };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`;
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();

  try {
    const fbc = buildFbcFromStoredFbclid(fbRaw);
    const event_time = Math.floor(Date.now() / 1000);
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: "QualifiedLead",
          event_time,
          action_source: "website",
          event_source_url: EVENT_SOURCE_URL,
          user_data: {
            fbc,
          },
          custom_data: {
            lead_id: leadId,
            lead_quality: "qualified",
          },
        },
      ],
      access_token: accessToken,
    };
    if (testEventCode) {
      body.test_event_code = testEventCode;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text().catch(() => "");

    if (res.ok) {
      console.log("[meta-capi] QualifiedLead sent", {
        leadId,
        httpStatus: res.status,
        bodyPreview: text.slice(0, 500),
      });
      return { ok: true, status: res.status, responseText: text };
    }

    console.warn("[meta-capi] QualifiedLead failed", {
      leadId,
      httpStatus: res.status,
      responseText: text.slice(0, 2000),
    });
    return { ok: false, status: res.status, responseText: text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[meta-capi] QualifiedLead error", {
      leadId,
      message,
      error: e,
    });
    return {
      ok: false,
      reason: "exception",
      responseText: message,
    };
  }
}
