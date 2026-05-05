import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export type PendingCrmRealtimePayload =
  | {
      kind: "crm_task_prepare";
      actor_user_id: string;
      title: string;
      description: string | null;
      due_at: string | null;
      priority: string;
      related_entity_type: string | null;
      related_entity_id: string | null;
      created_at_ms: number;
    }
  | {
      kind: "crm_task_complete";
      actor_user_id: string;
      task_id: string;
      created_at_ms: number;
    };

const TTL_MS = 8 * 60 * 1000;

function signingSecret(): string {
  const a = process.env.SAINTLY_CRM_AI_PENDING_SECRET?.trim();
  if (a) return a;
  const b = process.env.OPENAI_API_KEY?.trim();
  return b ?? "";
}

export function mintPendingToken(payload: PendingCrmRealtimePayload): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const enveloped = { ...payload, exp: payload.created_at_ms + TTL_MS };
  const raw = Buffer.from(JSON.stringify(enveloped), "utf8");
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  return `${raw.toString("base64url")}.${sig}`;
}

export function consumePendingTaskPrepareToken(token: string, actorUserId: string) {
  return consumeTypedToken(token, "crm_task_prepare", actorUserId);
}

export function consumePendingTaskCompleteToken(token: string, actorUserId: string) {
  return consumeTypedToken(token, "crm_task_complete", actorUserId);
}

function consumeTypedToken<T extends PendingCrmRealtimePayload["kind"]>(
  token: string,
  expectedKind: T,
  actorUserId: string
): Extract<PendingCrmRealtimePayload, { kind: T }> | null {
  const secret = signingSecret();
  if (!secret || typeof token !== "string" || !token.includes(".")) return null;
  const [bodyB64, sigHex] = token.split(".", 2);
  if (!bodyB64 || !sigHex || !/^[a-f0-9]{64}$/i.test(sigHex)) return null;
  let raw: Buffer;
  try {
    raw = Buffer.from(bodyB64, "base64url");
  } catch {
    return null;
  }
  const expectedSig = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"), "utf8");
  const actualSig = Buffer.from(sigHex, "utf8");
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.exp !== "number" || typeof o.created_at_ms !== "number") return null;
  if (Date.now() > o.exp) return null;
  if (typeof o.actor_user_id !== "string" || o.actor_user_id.trim() !== actorUserId.trim()) return null;
  if (typeof o.kind !== "string" || o.kind !== expectedKind) return null;

  const base = parsed as PendingCrmRealtimePayload;

  if (base.kind === "crm_task_prepare") {
    if (typeof base.title !== "string" || !base.title.trim()) return null;
    if (typeof base.priority !== "string") return null;
    return base as Extract<PendingCrmRealtimePayload, { kind: T }>;
  }
  if (base.kind === "crm_task_complete") {
    if (typeof base.task_id !== "string" || !base.task_id.trim()) return null;
    return base as Extract<PendingCrmRealtimePayload, { kind: T }>;
  }
  return null;
}
