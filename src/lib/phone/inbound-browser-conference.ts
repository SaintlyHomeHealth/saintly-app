import { createHmac, timingSafeEqual } from "crypto";

import { parseStaffUserIdFromTwilioClientFrom } from "@/lib/softphone/twilio-client-identity";
import { resolveOutboundBridgeSigningSecret } from "@/lib/phone/outbound-pstn-bridge-config";
import { escapeXml } from "@/lib/twilio/softphone-conference";

export const INBOUND_CONFERENCE_ROOM_PREFIX = "sf-in";

/** Default on; set `TWILIO_INBOUND_USE_CONFERENCE=0` to restore legacy `<Dial><Client>` bridge. */
export function inboundBrowserConferenceEnabled(): boolean {
  const v = process.env.TWILIO_INBOUND_USE_CONFERENCE?.trim().toLowerCase() ?? "";
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

/** Conference friendly name for PSTN inbound (customer parent CallSid). */
export function inboundConferenceRoomName(customerCallSid: string): string {
  const sid = customerCallSid.trim();
  return `${INBOUND_CONFERENCE_ROOM_PREFIX}-${sid}`;
}

export type ParsedConferenceRoom =
  | { kind: "outbound"; roomName: string; mergeLookupSid: string; clientLegSid: string }
  | { kind: "inbound"; roomName: string; mergeLookupSid: string; customerCallSid: string };

/** Parse `sf-<clientSid>` (outbound) or `sf-in-<customerSid>` (inbound). */
export function parseConferenceRoomName(friendlyName: string): ParsedConferenceRoom | null {
  const t = friendlyName.trim();
  const inPrefix = `${INBOUND_CONFERENCE_ROOM_PREFIX}-`;
  if (t.startsWith(inPrefix)) {
    const customerSid = t.slice(inPrefix.length).trim();
    if (!customerSid.startsWith("CA") || customerSid.length < 34) return null;
    return { kind: "inbound", roomName: t, mergeLookupSid: customerSid, customerCallSid: customerSid };
  }
  const outPrefix = "sf-";
  if (t.startsWith(outPrefix) && !t.startsWith(inPrefix)) {
    const clientSid = t.slice(outPrefix.length).trim();
    if (!clientSid.startsWith("CA") || clientSid.length < 34) return null;
    return { kind: "outbound", roomName: t, mergeLookupSid: clientSid, clientLegSid: clientSid };
  }
  return null;
}

export type InboundStaffConnectTokenV1 = {
  v: 1;
  parent: string;
  staff: string;
  exp: number;
};

const TOKEN_TTL_SEC = 600;

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4 || 4);
  const norm = (s + "=".repeat(pad === 4 ? 0 : pad)).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(norm, "base64");
}

export function mintInboundStaffConnectToken(input: { parentCallSid: string; staffUserId: string }): string {
  const secret = resolveOutboundBridgeSigningSecret();
  if (!secret) throw new Error("missing_signing_secret");
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload: InboundStaffConnectTokenV1 = {
    v: 1,
    parent: input.parentCallSid.trim(),
    staff: input.staffUserId.trim(),
    exp,
  };
  const payloadPart = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(payloadPart).digest();
  return `${payloadPart}.${b64urlEncode(sig)}`;
}

export function verifyInboundStaffConnectToken(
  token: string | null | undefined
): InboundStaffConnectTokenV1 | null {
  const secret = resolveOutboundBridgeSigningSecret();
  if (!secret || !token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = createHmac("sha256", secret).update(payloadPart).digest();
    actual = b64urlDecode(sigPart);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(payloadPart).toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1) return null;
  const parent = typeof o.parent === "string" ? o.parent.trim() : "";
  const staff = typeof o.staff === "string" ? o.staff.trim() : "";
  const exp = typeof o.exp === "number" && Number.isFinite(o.exp) ? o.exp : 0;
  if (!parent.startsWith("CA") || !staff || exp < Math.floor(Date.now() / 1000)) return null;
  return { v: 1, parent, staff, exp };
}

export function buildInboundStaffConnectUrl(
  publicBase: string,
  parentCallSid: string,
  staffUserId: string
): string {
  const base = publicBase.trim().replace(/\/$/, "");
  const token = mintInboundStaffConnectToken({ parentCallSid, staffUserId });
  return `${base}/api/twilio/voice/inbound-staff-connect?token=${encodeURIComponent(token)}`;
}

export function conferenceStatusCallbackAttrs(publicBase: string): string {
  const base = publicBase.trim().replace(/\/$/, "");
  if (!base) return "";
  return ` statusCallback="${escapeXml(`${base}/api/twilio/voice/softphone-conference-events`)}" statusCallbackMethod="POST" statusCallbackEvent="join leave mute hold start end"`;
}

export function staffUserIdFromClientCallParams(input: {
  toRaw?: string;
  tokenStaffUserId?: string;
}): string | null {
  if (input.tokenStaffUserId?.trim()) return input.tokenStaffUserId.trim();
  const to = (input.toRaw ?? "").trim();
  if (!to.toLowerCase().startsWith("client:")) return null;
  return parseStaffUserIdFromTwilioClientFrom(to);
}
