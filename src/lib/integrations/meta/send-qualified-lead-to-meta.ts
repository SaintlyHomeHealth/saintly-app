/**
 * Sends a QualifiedLead event to Meta Conversions API when CRM marks a lead qualified
 * and we have a Facebook click id. Unqualified leads are never sent — only positive
 * conversion signals go to Meta.
 *
 * Requires `fbclid` for attribution; without it we skip the API call.
 *
 * Network/API failures are logged only; the CRM PATCH must still succeed.
 */

export type SendQualifiedLeadToMetaInput = {
  id: string;
  fbclid: string | null | undefined;
  lead_quality: string | null | undefined;
};

const GRAPH_VERSION = "v23.0";
const TIMEOUT_MS = 12_000;
const EVENT_SOURCE_URL = "https://www.appsaintlyhomehealth.com";

export function sendQualifiedLeadToMeta(input: SendQualifiedLeadToMetaInput): void {
  const lead_quality = input.lead_quality;
  const fbRaw = typeof input.fbclid === "string" ? input.fbclid.trim() : "";

  if (lead_quality !== "qualified" || !fbRaw) {
    return;
  }

  const datasetId = process.env.META_DATASET_ID?.trim();
  const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN?.trim();

  if (!datasetId || !accessToken) {
    console.warn(
      "[meta-capi] META_DATASET_ID or META_CONVERSIONS_ACCESS_TOKEN missing; skipping QualifiedLead event",
      { leadId: input.id }
    );
    return;
  }

  const leadId = typeof input.id === "string" ? input.id.trim() : "";
  if (!leadId) {
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`;
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();

  void (async () => {
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

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const text = await res.text().catch(() => "");

      if (res.ok) {
        console.log("[meta-capi] QualifiedLead sent", { leadId, httpStatus: res.status, bodyPreview: text.slice(0, 500) });
      } else {
        console.warn("[meta-capi] QualifiedLead failed", {
          leadId,
          httpStatus: res.status,
          responseText: text.slice(0, 2000),
        });
      }
    } catch (e) {
      console.warn("[meta-capi] QualifiedLead error", { leadId, error: e });
    }
  })();
}
