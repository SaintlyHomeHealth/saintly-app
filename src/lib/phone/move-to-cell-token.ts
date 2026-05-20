import { createHmac, timingSafeEqual } from "crypto";

import { resolveOutboundBridgeSigningSecret } from "@/lib/phone/outbound-pstn-bridge-config";

export type MoveToCellTokenPayloadV1 = {
  v: 1;
  staff: string;
  client_call_sid: string;
  conference_sid: string;
  conference_friendly_name: string;
  presentation_cli: string;
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

export function mintMoveToCellToken(
  input: Omit<MoveToCellTokenPayloadV1, "v" | "exp">
): string {
  const secret = resolveOutboundBridgeSigningSecret();
  if (!secret) {
    throw new Error("missing_signing_secret");
  }
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload: MoveToCellTokenPayloadV1 = { v: 1, ...input, exp };
  const payloadPart = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(payloadPart).digest();
  return `${payloadPart}.${b64urlEncode(sig)}`;
}

export function verifyMoveToCellToken(token: string | null | undefined): MoveToCellTokenPayloadV1 | null {
  const secret = resolveOutboundBridgeSigningSecret();
  if (!secret || !token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  if (!payloadPart || !sigPart) return null;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = createHmac("sha256", secret).update(payloadPart).digest();
    actual = b64urlDecode(sigPart);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(payloadPart).toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1) return null;
  const staff = typeof o.staff === "string" ? o.staff.trim() : "";
  const clientCallSid = typeof o.client_call_sid === "string" ? o.client_call_sid.trim() : "";
  const conferenceSid = typeof o.conference_sid === "string" ? o.conference_sid.trim() : "";
  const friendly = typeof o.conference_friendly_name === "string" ? o.conference_friendly_name.trim() : "";
  const cli = typeof o.presentation_cli === "string" ? o.presentation_cli.trim() : "";
  const exp = typeof o.exp === "number" && Number.isFinite(o.exp) ? o.exp : 0;
  if (!staff || !clientCallSid || !conferenceSid || !friendly || !cli || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return {
    v: 1,
    staff,
    client_call_sid: clientCallSid,
    conference_sid: conferenceSid,
    conference_friendly_name: friendly,
    presentation_cli: cli,
    exp,
  };
}
