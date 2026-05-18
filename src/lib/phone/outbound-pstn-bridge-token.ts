import { createHmac, timingSafeEqual } from "crypto";

import { resolveOutboundBridgeSigningSecret } from "@/lib/phone/outbound-pstn-bridge-config";

export type OutboundPstnBridgeTokenPayloadV1 = {
  v: 1;
  /** Patient / contact E.164 */
  patient: string;
  /** Twilio presentation CLI for patient leg */
  cli: string;
  /** Staff auth user id (UUID) */
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

export function mintOutboundPstnBridgeToken(input: Omit<OutboundPstnBridgeTokenPayloadV1, "v" | "exp">): string {
  const secret = resolveOutboundBridgeSigningSecret();
  if (!secret) {
    throw new Error("missing_signing_secret");
  }
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload: OutboundPstnBridgeTokenPayloadV1 = { v: 1, ...input, exp };
  const payloadJson = JSON.stringify(payload);
  const payloadPart = b64urlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = createHmac("sha256", secret).update(payloadPart).digest();
  const sigPart = b64urlEncode(sig);
  return `${payloadPart}.${sigPart}`;
}

export function verifyOutboundPstnBridgeToken(token: string | null | undefined): OutboundPstnBridgeTokenPayloadV1 | null {
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
  const patient = typeof o.patient === "string" ? o.patient.trim() : "";
  const cli = typeof o.cli === "string" ? o.cli.trim() : "";
  const staff = typeof o.staff === "string" ? o.staff.trim() : "";
  const exp = typeof o.exp === "number" && Number.isFinite(o.exp) ? o.exp : 0;
  if (!patient || !cli || !staff || exp < Math.floor(Date.now() / 1000)) return null;
  return { v: 1, patient, cli, staff, exp };
}
