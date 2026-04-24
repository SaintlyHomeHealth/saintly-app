import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function loadKey(): Buffer {
  const raw = process.env.INTERNAL_CHAT_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("INTERNAL_CHAT_ENCRYPTION_KEY is not set (32-byte key as 64-char hex or base64).");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) {
    return b64;
  }
  throw new Error("INTERNAL_CHAT_ENCRYPTION_KEY must be 32 bytes (hex or base64).");
}

export function encryptInternalChatUtf8(plaintext: string): { ciphertext: Buffer; nonce: Buffer } {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), nonce: iv };
}

export function decryptInternalChatUtf8(ciphertext: Buffer, nonce: Buffer): string {
  const key = loadKey();
  if (nonce.length !== IV_LEN) {
    throw new Error("Invalid nonce.");
  }
  if (ciphertext.length < AUTH_TAG_LEN) {
    throw new Error("Invalid ciphertext.");
  }
  const tag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LEN);
  const data = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
