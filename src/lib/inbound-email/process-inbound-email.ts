import "server-only";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveInboundChannelFromToEmails } from "./alias-routing";
import { verifyInboundEmailSharedSecret } from "./auth";
import { extractPhoneNumbersFromText } from "./extract";
import {
  handleInboundBillingEmail,
  handleInboundCareEmail,
  handleInboundJoinEmail,
  handleInboundReferralEmail,
} from "./handlers";
import { parseInboundEmailRequest } from "./parse-inbound-request";
import { inboundCommunicationExists, insertInboundCommunicationRow } from "./persist-inbound";
import { maybeSendInboundEmailAutoreply } from "./sms-autoreply";
import type { InboundEmailChannelKey } from "./types";

export async function handleInboundEmailHttpPost(req: NextRequest): Promise<NextResponse> {
  const auth = verifyInboundEmailSharedSecret(req);
  if (!auth.ok) {
    const status = auth.reason === "misconfigured" ? 503 : 401;
    return NextResponse.json({ ok: false, error: auth.reason }, { status });
  }

  const parsed = await parseInboundEmailRequest(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { normalized, rawRecord } = parsed;
  const channel = resolveInboundChannelFromToEmails(normalized.toEmails);
  if (!channel) {
    console.warn("[inbound-email] no alias match in To:", normalized.toEmails);
    return NextResponse.json({ ok: false, error: "no_matching_alias" }, { status: 400 });
  }

  const msgId = normalized.messageId?.trim();
  if (msgId) {
    const exists = await inboundCommunicationExists(normalized.provider, msgId);
    if (exists) {
      console.log(`[inbound-email][${channel}] duplicate webhook (inbound_communications)`, { msgId });
      return NextResponse.json({ ok: true, duplicate: true, channel });
    }
  }

  let handlerResult;
  switch (channel) {
    case "referrals":
      handlerResult = await handleInboundReferralEmail(normalized);
      break;
    case "care":
      handlerResult = await handleInboundCareEmail(normalized);
      break;
    case "join":
      handlerResult = await handleInboundJoinEmail(normalized);
      break;
    case "billing":
      handlerResult = await handleInboundBillingEmail(normalized);
      break;
    default:
      return NextResponse.json({ ok: false, error: "unknown_channel" }, { status: 400 });
  }

  const ins = await insertInboundCommunicationRow({
    channel,
    normalized,
    rawPayload: rawRecord,
    relatedLeadId: handlerResult.relatedLeadId,
    relatedCandidateId: handlerResult.relatedCandidateId,
    parsedEntities: handlerResult.parsedEntities,
    reviewState: handlerResult.reviewState,
  });

  if (!ins.ok) {
    if (msgId && (ins.code === "23505" || /duplicate|unique/i.test(ins.error))) {
      console.log(`[inbound-email][${channel}] duplicate after handler (race)`, { msgId });
      return NextResponse.json({ ok: true, duplicate: true, channel });
    }
    return NextResponse.json({ ok: false, error: "persist_inbound_failed", detail: ins.error }, { status: 500 });
  }

  const phones = extractPhoneNumbersFromText(
    [normalized.subject, normalized.textBody, normalized.htmlBody].filter(Boolean).join("\n")
  );
  await maybeSendInboundEmailAutoreply({
    channel,
    normalized,
    primaryE164: phones[0] ?? null,
  });

  return NextResponse.json({
    ok: true,
    channel,
    inboundId: ins.id,
    relatedLeadId: handlerResult.relatedLeadId,
    relatedCandidateId: handlerResult.relatedCandidateId,
  });
}

/** Test helper: run channel dispatch without HTTP / auth. */
export async function dispatchInboundEmailForTests(input: {
  channel: InboundEmailChannelKey;
  normalized: import("./types").InboundEmailNormalized;
}): Promise<import("./handlers").InboundEmailHandlerResult> {
  switch (input.channel) {
    case "referrals":
      return handleInboundReferralEmail(input.normalized);
    case "care":
      return handleInboundCareEmail(input.normalized);
    case "join":
      return handleInboundJoinEmail(input.normalized);
    case "billing":
      return handleInboundBillingEmail(input.normalized);
    default:
      throw new Error("unknown_channel");
  }
}
