/**
 * Sends qualified CRM leads (with a Facebook click id) to Zapier for a second automation
 * that can forward conversion feedback to Meta. Only `qualified` is sent so unqualified
 * leads are never pushed as positive signals to ad platforms.
 *
 * Meta's conversion API expects `fbclid` (or other user data) to attribute events; without
 * it we skip the webhook — there is nothing useful to send for attribution.
 *
 * Webhook failures are logged only; callers must not depend on this (CRM updates must
 * succeed even if Zapier or Meta is down).
 */

export type SendQualifiedLeadToZapierInput = {
  id: string;
  fbclid: string | null | undefined;
  lead_quality: string | null | undefined;
};

const TIMEOUT_MS = 8000;

/**
 * Fire-and-forget POST to `ZAPIER_QUALIFIED_LEAD_WEBHOOK_URL`. Does not throw; does not block
 * the caller (CRM PATCH returns immediately).
 */
export function sendQualifiedLeadToZapier(input: SendQualifiedLeadToZapierInput): void {
  const lead_quality = input.lead_quality;
  const fbRaw = typeof input.fbclid === "string" ? input.fbclid.trim() : "";

  // Unqualified (or other values): never notify — avoids sending negative or ambiguous events to Meta pipelines.
  if (lead_quality !== "qualified" || !fbRaw) {
    return;
  }

  const url = process.env.ZAPIER_QUALIFIED_LEAD_WEBHOOK_URL?.trim();
  if (!url) {
    console.warn(
      "[zapier-qualified-lead] ZAPIER_QUALIFIED_LEAD_WEBHOOK_URL is not set; skipping qualified-lead webhook",
      { leadId: input.id }
    );
    return;
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) {
    return;
  }

  void (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          fbclid: fbRaw,
          lead_quality: "qualified",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        console.log("[zapier-qualified-lead] webhook sent", { leadId: id, httpStatus: res.status });
      } else {
        const t = await res.text().catch(() => "");
        console.warn("[zapier-qualified-lead] webhook non-OK", {
          leadId: id,
          httpStatus: res.status,
          bodyPreview: t.slice(0, 500),
        });
      }
    } catch (e) {
      console.warn("[zapier-qualified-lead] webhook error", { leadId: id, error: e });
    }
  })();
}
