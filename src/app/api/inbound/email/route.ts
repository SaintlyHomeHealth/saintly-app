import type { NextRequest } from "next/server";

import { handleInboundEmailHttpPost } from "@/lib/inbound-email/process-inbound-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Inbound parsed email webhook (provider-agnostic). See `docs/inbound-email-webhook.md`.
 */
export async function POST(req: NextRequest) {
  console.log("[inbound-email] POST /api/inbound/email");
  return handleInboundEmailHttpPost(req);
}
