import { NextResponse } from "next/server";

import { crmLeadsIdDebugEnabled } from "@/lib/crm/crm-lead-id";

type BeaconBody = {
  context?: string;
  rawFromDb?: string;
  idPassedToClient?: string;
  normalized?: string;
  openHref?: string | null;
  displayNameHint?: string;
};

/**
 * Client → server beacon so mobile WebView Open taps appear in Vercel runtime logs.
 * No-op unless CRM_LEADS_ID_DEBUG / NEXT_PUBLIC_CRM_LEADS_ID_DEBUG is enabled.
 */
export async function POST(req: Request) {
  if (!crmLeadsIdDebugEnabled()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let body: BeaconBody = {};
  try {
    body = (await req.json()) as BeaconBody;
  } catch {
    body = {};
  }

  console.warn("[crm/leads-id-debug/client-beacon]", {
    context: typeof body.context === "string" ? body.context : "unknown",
    rawFromDb: typeof body.rawFromDb === "string" ? body.rawFromDb : undefined,
    rawLen: typeof body.rawFromDb === "string" ? body.rawFromDb.length : undefined,
    idPassedToClient: typeof body.idPassedToClient === "string" ? body.idPassedToClient : undefined,
    normalized: typeof body.normalized === "string" ? body.normalized : undefined,
    openHref: typeof body.openHref === "string" ? body.openHref : body.openHref ?? null,
    displayNameHint:
      typeof body.displayNameHint === "string" ? body.displayNameHint.slice(0, 40) : undefined,
  });

  return NextResponse.json({ ok: true });
}
