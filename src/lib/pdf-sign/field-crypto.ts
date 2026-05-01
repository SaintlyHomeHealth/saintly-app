import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;

function resolveKeyBytes(): Buffer {
  const raw = process.env.SAINTLY_PDF_SIGN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "SAINTLY_PDF_SIGN_ENCRYPTION_KEY is required for TIN/SSN encryption (32-byte hex or passphrase)."
    );
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return scryptSync(raw, "saintly-pdf-sign-salt", KEY_LEN);
}

export function encryptSensitiveField(plain: string): { ciphertext: string; last4: string } {
  const digits = plain.replace(/\D/g, "");
  const last4 = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, "0").slice(-4);
  const key = resolveKeyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, enc]).toString("base64");
  return { ciphertext: packed, last4 };
}

export function decryptSensitiveField(ciphertext: string): string {
  const key = resolveKeyBytes();
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < 12 + 16) throw new Error("Invalid ciphertext");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
