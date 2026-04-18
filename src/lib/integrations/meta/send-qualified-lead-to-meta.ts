/**
 * Sends a QualifiedLead event to Meta Conversions API when CRM marks a lead qualified
 * and we have a Facebook click id. Unqualified leads are never sent — only positive
 * conversion signals go to Meta.
 *
 * Requires `fbclid` for attribution; without it we skip the API call.
 *
 * Network/API failures are returned in the result; callers should not fail CRM updates.
 *
 * TODO(meta-debug): Remove or gate `[meta-debug]` console logs once Meta Test Events works.
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
const TIMEOUT_MS = 8000;
const EVENT_SOURCE_URL = "https://www.appsaintlyhomehealth.com";

export async function sendQualifiedLeadToMeta(
  input: SendQualifiedLeadToMetaInput
): Promise<SendQualifiedLeadToMetaResult> {
  console.log("[meta-debug] helper called", {
    leadId: input.id,
    lead_quality: input.lead_quality,
    fbclid: input.fbclid,
  });

  const lead_quality = input.lead_quality;
  const fbRaw = typeof input.fbclid === "string" ? input.fbclid.trim() : "";

  const envMetaDatasetId = !!process.env.META_DATASET_ID?.trim();
  const envMetaAccessToken = !!process.env.META_CONVERSIONS_ACCESS_TOKEN?.trim();
  const envMetaTestEventCode = process.env.META_TEST_EVENT_CODE?.trim();

  console.log("[meta-debug] env presence", {
    META_DATASET_ID: envMetaDatasetId,
    META_CONVERSIONS_ACCESS_TOKEN: envMetaAccessToken,
    META_TEST_EVENT_CODE_set: !!envMetaTestEventCode,
    META_TEST_EVENT_CODE_value: envMetaTestEventCode ?? null,
  });

  if (lead_quality !== "qualified") {
    console.log("[meta-debug] early return: not qualified", { lead_quality });
    return { ok: true, skipped: true, reason: "not_qualified" };
  }

  if (!fbRaw) {
    console.log("[meta-debug] early return: missing or empty fbclid after trim");
    return { ok: true, skipped: true, reason: "missing_fbclid" };
  }

  const datasetId = process.env.META_DATASET_ID?.trim();
  const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN?.trim();

  if (!datasetId) {
    console.log("[meta-debug] early return: missing META_DATASET_ID");
    return { ok: true, skipped: true, reason: "missing_META_DATASET_ID" };
  }

  if (!accessToken) {
    console.log("[meta-debug] early return: missing META_CONVERSIONS_ACCESS_TOKEN");
    return { ok: true, skipped: true, reason: "missing_META_CONVERSIONS_ACCESS_TOKEN" };
  }

  const leadId = typeof input.id === "string" ? input.id.trim() : "";
  if (!leadId) {
    console.log("[meta-debug] early return: empty lead id");
    return { ok: true, skipped: true, reason: "empty_lead_id" };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`;
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();

  try {
    const event_time = Math.floor(Date.now() / 1000);
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: "QualifiedLead",
          event_time,
          action_source: "website",
          event_source_url: EVENT_SOURCE_URL,
          user_data: {
            fbclid: fbRaw,
          },
          custom_data: {
            lead_id: leadId,
            lead_quality: "qualified",
          },
        },
      ],
      access_token: accessToken,
    };
    /** Routes events to Meta “Test events” when debugging (optional). */
    if (testEventCode) {
      body.test_event_code = testEventCode;
    }

    const firstEvent = (body.data as unknown[])[0] as Record<string, unknown>;
    const userData = firstEvent.user_data as Record<string, unknown>;
    const customData = firstEvent.custom_data as Record<string, unknown>;

    console.log("[meta-debug] Meta CAPI request", {
      url,
      event_name: firstEvent.event_name,
      event_time: firstEvent.event_time,
      action_source: firstEvent.action_source,
      event_source_url: firstEvent.event_source_url,
      "user_data.fbclid": userData?.fbclid,
      "custom_data.lead_id": customData?.lead_id,
      "custom_data.lead_quality": customData?.lead_quality,
      test_event_code_present: !!body.test_event_code,
      test_event_code: body.test_event_code ?? null,
      access_token: "[REDACTED]",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text().catch(() => "");

    console.log("[meta-debug] Meta CAPI response", {
      leadId,
      status: res.status,
      responseText: text,
    });

    if (res.ok) {
      console.log("[meta-capi] QualifiedLead sent", { leadId, httpStatus: res.status, bodyPreview: text.slice(0, 500) });
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
    console.warn("[meta-debug] Meta CAPI catch", {
      leadId,
      error: e,
      message: e instanceof Error ? e.message : undefined,
      stack: e instanceof Error ? e.stack : undefined,
    });
    console.warn("[meta-capi] QualifiedLead error", { leadId, error: e });
    return {
      ok: false,
      reason: "exception",
      responseText: message,
    };
  }
}
