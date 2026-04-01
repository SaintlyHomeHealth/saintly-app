import { fetchOpenAiJsonObject } from "@/lib/phone/phone-call-ai-context";

export type AiVoiceRealtimeIntent = "spam" | "patient" | "referral" | "urgent_medical";

const ALLOWED = new Set<AiVoiceRealtimeIntent>(["spam", "patient", "referral", "urgent_medical"]);

const SYSTEM_PROMPT = `You classify caller intent for Saintly Home Health (home health agency). Return a single JSON object with exactly one key "intent" whose value is exactly one of these strings:
- "spam" — robocalls, telemarketing, obvious scams, abusive/wrong-number calls with no legitimate care need
- "patient" — someone seeking home health for themselves or a family member, scheduling, billing questions as a client
- "referral" — physician, hospital, clinic, social worker, or agency referring or following up on a patient
- "urgent_medical" — possible emergency: chest pain, stroke symptoms, severe bleeding, trouble breathing, unconsciousness, or caller explicitly says it is an emergency

If unclear, prefer "patient" for general help requests; prefer "referral" if they mention a doctor, hospital, or referral. Never use values outside the four listed.`;

/**
 * Classifies short Gather speech for real-time Twilio routing (not persisted CRM).
 */
export async function classifyAiVoiceRealtimeIntent(transcript: string): Promise<AiVoiceRealtimeIntent | null> {
  const t = transcript.trim().slice(0, 4000);
  if (!t) return null;

  const parsed = await fetchOpenAiJsonObject(
    SYSTEM_PROMPT,
    `Caller speech (may be imperfect transcription):\n${t}`
  );
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const intentRaw = (parsed as Record<string, unknown>).intent;
  const intent =
    typeof intentRaw === "string" ? intentRaw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_") : "";

  let normalized = intent;
  if (normalized === "urgentmedical") normalized = "urgent_medical";

  if (ALLOWED.has(normalized as AiVoiceRealtimeIntent)) {
    return normalized as AiVoiceRealtimeIntent;
  }
  return null;
}
