/**
 * Sends a QualifiedLead event to Meta Conversions API when CRM marks a lead qualified
 * and we have a Facebook click id. Unqualified leads are never sent.
 *
 * Returns a result object; never throws. Callers must not fail CRM updates when Meta fails.
 */

import {
  type MetaCapiSendResult,
  postMetaConversionEvent,
} from "@/lib/integrations/meta/meta-capi-shared";

export type SendQualifiedLeadToMetaInput = {
  id: string;
  fbclid: string | null | undefined;
  lead_quality: string | null | undefined;
};

export type SendQualifiedLeadToMetaResult = MetaCapiSendResult;

export { buildFbcFromStoredFbclid } from "@/lib/integrations/meta/meta-capi-shared";

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

  const leadId = typeof input.id === "string" ? input.id.trim() : "";
  if (!leadId) {
    return { ok: true, skipped: true, reason: "empty_lead_id" };
  }

  return postMetaConversionEvent({
    eventName: "QualifiedLead",
    leadId,
    fbclidRaw: fbRaw,
    customData: {
      lead_quality: "qualified",
    },
  });
}
