/**
 * Sends an AdmittedPatient event to Meta Conversions API when a CRM lead is marked admitted
 * and we have a Facebook click id (stored as `fbclid`, sent as `fbc`).
 *
 * Never throws. Callers must not fail CRM updates when Meta fails.
 */

import {
  type MetaCapiSendResult,
  postMetaConversionEvent,
} from "@/lib/integrations/meta/meta-capi-shared";

export type SendAdmittedPatientToMetaInput = {
  id: string;
  fbclid: string | null | undefined;
  lead_status: string | null | undefined;
};

export type SendAdmittedPatientToMetaResult = MetaCapiSendResult;

function norm(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim().toLowerCase() : "";
}

export async function sendAdmittedPatientToMeta(
  input: SendAdmittedPatientToMetaInput
): Promise<SendAdmittedPatientToMetaResult> {
  if (norm(input.lead_status) !== "admitted") {
    return { ok: true, skipped: true, reason: "not_admitted" };
  }

  const fbRaw = typeof input.fbclid === "string" ? input.fbclid.trim() : "";
  if (!fbRaw) {
    return { ok: true, skipped: true, reason: "missing_fbclid" };
  }

  const leadId = typeof input.id === "string" ? input.id.trim() : "";
  if (!leadId) {
    return { ok: true, skipped: true, reason: "empty_lead_id" };
  }

  return postMetaConversionEvent({
    eventName: "AdmittedPatient",
    leadId,
    fbclidRaw: fbRaw,
    customData: {
      lead_status: "admitted",
    },
  });
}
