import { createHash } from "node:crypto";

import { fetchOpenAiJsonObject } from "@/lib/phone/phone-call-ai-context";

import { LIVE_RECEPTIONIST_SYSTEM_PROMPT } from "./voice-ai-live-prompt";

export function buildLiveInputFingerprint(callSid: string, speech: string): string {
  const h = createHash("sha256").update(speech).digest("hex").slice(0, 24);
  return `v1-live|${callSid.trim()}|${h}`;
}

export async function runLiveReceptionistOpenAi(
  speech: string,
  fromE164: string,
  toE164: string
): Promise<unknown | null> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return null;
  }
  const user = `Caller speech (voice transcription):\n${speech}\n\nFrom: ${fromE164}\nTo: ${toE164}\n\nReturn JSON only as instructed.`;
  return fetchOpenAiJsonObject(LIVE_RECEPTIONIST_SYSTEM_PROMPT, user);
}
