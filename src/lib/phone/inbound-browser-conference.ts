import { createHmac, timingSafeEqual } from "crypto";
import twilio from "twilio";

import { parseStaffUserIdFromTwilioClientFrom } from "@/lib/softphone/twilio-client-identity";
import { resolveOutboundBridgeSigningSecret } from "@/lib/phone/outbound-pstn-bridge-config";
import { escapeXml } from "@/lib/twilio/softphone-conference";

export const INBOUND_CONFERENCE_ROOM_PREFIX = "sf-in";

/**
 * Inbound conference connect (Move-to-cell mid-call) is **disabled** until re-verified.
 * Stable path: parent PSTN `<Dial answerOnBridge="true"><Client>…</Client></Dial>` — no `url` on Client,
 * no conference redirect on answer, no hold music.
 *
 * Re-enable later by restoring env check here after conference connect is tested end-to-end.
 */
export function inboundBrowserConferenceEnabled(): boolean {
  const v = process.env.TWILIO_INBOUND_USE_CONFERENCE?.trim().toLowerCase() ?? "";
  const envWantsConference = v === "1" || v === "true" || v === "yes";
  if (envWantsConference) {
    console.warn(
      "[inbound-browser-conference] TWILIO_INBOUND_USE_CONFERENCE is set but inbound conference connect is disabled — using direct Dial/Client bridge"
    );
  }
  return false;
}

/** Staff-visible label for diagnostics (raw env + resolved on/off). */
export function inboundBrowserConferenceEnvLabel(): string {
  const raw = process.env.TWILIO_INBOUND_USE_CONFERENCE?.trim();
  if (raw === undefined || raw === "") return "unset (off)";
  return inboundBrowserConferenceEnabled() ? `${raw} (enabled)` : `${raw} (disabled)`;
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

/** Optional staff-leg waitUrl for debugging only (`INBOUND_CONFERENCE_STAFF_WAIT_URL`, may be empty string). */
export function inboundConferenceStaffWaitUrlAttr(publicBase: string): string {
  if (!process.env.INBOUND_CONFERENCE_STAFF_WAIT_URL) return "";
  const raw = process.env.INBOUND_CONFERENCE_STAFF_WAIT_URL.trim();
  const url =
    raw === ""
      ? `${publicBase.trim().replace(/\/$/, "")}/api/twilio/voice/softphone-hold-music`
      : raw;
  if (!url) return ` waitUrl=""`;
  return ` waitUrl="${escapeXml(url)}"`;
}

export function buildCustomerConferenceJoinTwiml(room: string, publicBase: string): string {
  const confAttrs = conferenceStatusCallbackAttrs(publicBase);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" participantLabel="customer"${confAttrs}>${escapeXml(
      room
    )}</Conference>
  </Dial>
</Response>`.trim();
}

export function buildStaffConferenceJoinTwiml(room: string, publicBase: string): string {
  const confAttrs = conferenceStatusCallbackAttrs(publicBase);
  const waitAttr = inboundConferenceStaffWaitUrlAttr(publicBase);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="false" endConferenceOnExit="false" participantLabel="staff"${waitAttr}${confAttrs}>${escapeXml(
      room
    )}</Conference>
  </Dial>
</Response>`.trim();
}

/** Legacy staff-leg TwiML when conference connect cannot run — silent wait, never hold music on the main inbound path. */
export function legacyInboundStaffBridgeTwiml(_publicBase?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="600"/></Response>`;
}

export type TwilioErrorFields = {
  message: string;
  code: number | string | null;
  status: number | null;
  moreInfo: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RedirectCustomerIntoConferenceResult = {
  ok: boolean;
  parentUpdateOk: boolean;
  customerInConference: boolean;
  conferenceSid: string | null;
  parentStatusBefore: string | null;
  parentStatusAfter: string | null;
  pollAttempts: number;
  error: TwilioErrorFields | null;
};

/**
 * Move the customer (parent PSTN) leg into the inbound conference before the staff leg joins.
 */
export async function redirectCustomerIntoInboundConference(input: {
  accountSid: string;
  authToken: string;
  customerCallSid: string;
  room: string;
  publicBase: string;
  pollAttempts?: number;
  pollIntervalMs?: number;
}): Promise<RedirectCustomerIntoConferenceResult> {
  const customerSid = input.customerCallSid.trim();
  const room = input.room.trim();
  const attempts = input.pollAttempts ?? 20;
  const intervalMs = input.pollIntervalMs ?? 300;
  const fail = (partial: Partial<RedirectCustomerIntoConferenceResult>): RedirectCustomerIntoConferenceResult => ({
    ok: false,
    parentUpdateOk: false,
    customerInConference: false,
    conferenceSid: null,
    parentStatusBefore: null,
    parentStatusAfter: null,
    pollAttempts: 0,
    error: null,
    ...partial,
  });

  if (!customerSid.startsWith("CA") || !room.startsWith("sf-in-")) {
    return fail({ error: { message: "invalid customer sid or room", code: null, status: null, moreInfo: null } });
  }

  const client = twilio(input.accountSid, input.authToken);
  let parentStatusBefore: string | null = null;
  try {
    const parentBefore = await client.calls(customerSid).fetch();
    parentStatusBefore = typeof parentBefore.status === "string" ? parentBefore.status : null;
  } catch (e) {
    return fail({ error: twilioErrorFields(e) });
  }

  const parentTwiml = buildCustomerConferenceJoinTwiml(room, input.publicBase);
  let parentUpdateOk = false;
  let parentStatusAfter: string | null = null;
  try {
    const updated = await client.calls(customerSid).update({ twiml: parentTwiml });
    parentUpdateOk = true;
    parentStatusAfter = typeof updated.status === "string" ? updated.status : parentStatusBefore;
  } catch (e) {
    return fail({ parentStatusBefore, error: twilioErrorFields(e) });
  }

  let conferenceSid: string | null = null;
  let customerInConference = false;
  let pollCount = 0;
  for (let i = 0; i < attempts; i++) {
    pollCount = i + 1;
    try {
      const conferences = await client.conferences.list({ friendlyName: room, limit: 5 });
      for (const conf of conferences) {
        const sid = typeof conf.sid === "string" ? conf.sid : "";
        if (!sid.startsWith("CF") || conf.status === "completed") continue;
        const participants = await client.conferences(sid).participants.list({ limit: 20 });
        for (const part of participants) {
          const partSid = typeof part.callSid === "string" ? part.callSid.trim() : "";
          const partLabel = (part.label ?? "").trim().toLowerCase();
          if (partSid === customerSid || partLabel === "customer") {
            customerInConference = true;
            conferenceSid = sid;
            break;
          }
        }
        if (customerInConference) break;
      }
    } catch {
      /* poll again */
    }
    if (customerInConference) break;
    if (i < attempts - 1) await sleep(intervalMs);
  }

  /** Parent TwiML redirect is authoritative; poll may lag before participant list shows the customer. */
  const ok = parentUpdateOk;
  return {
    ok,
    parentUpdateOk,
    customerInConference,
    conferenceSid,
    parentStatusBefore,
    parentStatusAfter,
    pollAttempts: pollCount,
    error: ok
      ? customerInConference
        ? null
        : { message: "customer_not_in_conference_after_poll", code: null, status: null, moreInfo: null }
      : { message: "parent_conference_redirect_failed", code: null, status: null, moreInfo: null },
  };
}

export function twilioErrorFields(err: unknown): TwilioErrorFields {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    return {
      message: typeof o.message === "string" ? o.message : String(err),
      code: (o.code as number | string | null) ?? null,
      status: typeof o.status === "number" ? o.status : null,
      moreInfo: typeof o.moreInfo === "string" ? o.moreInfo : null,
    };
  }
  return { message: String(err), code: null, status: null, moreInfo: null };
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
