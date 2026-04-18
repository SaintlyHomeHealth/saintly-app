/**
 * Shared Meta Conversions API (server-side) helpers: `fbc` encoding and Graph POST.
 */

export type MetaCapiSendResult = {
  ok: boolean;
  status?: number;
  responseText?: string;
  skipped?: boolean;
  reason?: string;
};

export const GRAPH_VERSION = "v23.0";
export const TIMEOUT_MS = 20000;
export const EVENT_SOURCE_URL = "https://www.appsaintlyhomehealth.com";

/**
 * Meta CAPI expects `user_data.fbc`, not raw `fbclid`. Format:
 * `fb.1.<unix_timestamp_ms>.<fbclid>` (click id from the lead row).
 */
export function buildFbcFromStoredFbclid(fbclid: string): string {
  const unixTimestampMs = Date.now();
  return `fb.1.${unixTimestampMs}.${fbclid}`;
}

type PostMetaConversionEventArgs = {
  eventName: string;
  leadId: string;
  fbclidRaw: string;
  customData: Record<string, unknown>;
};

/**
 * POST one event to `/{dataset-id}/events`. Never throws.
 */
export async function postMetaConversionEvent(args: PostMetaConversionEventArgs): Promise<MetaCapiSendResult> {
  const { eventName, leadId, fbclidRaw, customData } = args;

  const datasetId = process.env.META_DATASET_ID?.trim();
  const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN?.trim();

  if (!datasetId) {
    return { ok: true, skipped: true, reason: "missing_META_DATASET_ID" };
  }

  if (!accessToken) {
    return { ok: true, skipped: true, reason: "missing_META_CONVERSIONS_ACCESS_TOKEN" };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`;
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();

  try {
    const fbc = buildFbcFromStoredFbclid(fbclidRaw);
    const event_time = Math.floor(Date.now() / 1000);
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: eventName,
          event_time,
          action_source: "website",
          event_source_url: EVENT_SOURCE_URL,
          user_data: {
            fbc,
          },
          custom_data: {
            lead_id: leadId,
            ...customData,
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
      console.log(`[meta-capi] ${eventName} sent`, {
        leadId,
        httpStatus: res.status,
        bodyPreview: text.slice(0, 500),
      });
      return { ok: true, status: res.status, responseText: text };
    }

    console.warn(`[meta-capi] ${eventName} failed`, {
      leadId,
      httpStatus: res.status,
      responseText: text.slice(0, 2000),
    });
    return { ok: false, status: res.status, responseText: text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[meta-capi] ${eventName} error`, {
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
