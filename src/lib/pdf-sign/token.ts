import "server-only";

import { createHash, randomBytes } from "crypto";

export function hashSignToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function createRawSignToken(): string {
  return randomBytes(32).toString("base64url");
}
