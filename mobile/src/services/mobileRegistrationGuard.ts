/**
 * In-memory dedupe for WebView-driven POST /push/register and /voice/register.
 * Prevents redundant network work when FCM + identity + VoIP token are unchanged and
 * registration recently succeeded (cookie session still valid).
 */
const SUCCESS_COOLDOWN_MS = 50_000;

type LastOk = { key: string; at: number };

let lastPushOk: LastOk | null = null;
let lastVoiceOk: LastOk | null = null;

function pushKey(fcmToken: string): string {
  return fcmToken;
}

function voiceKey(input: { fcmToken: string; twilioIdentity: string; voipPushToken: string | null }): string {
  const voip = typeof input.voipPushToken === 'string' ? input.voipPushToken.trim() : '';
  return `${input.fcmToken}|${input.twilioIdentity.trim()}|${voip}`;
}

export function shouldSkipPushRegister(fcmToken: string): boolean {
  const k = pushKey(fcmToken);
  const s = lastPushOk;
  if (!s) return false;
  return s.key === k && Date.now() - s.at < SUCCESS_COOLDOWN_MS;
}

export function shouldSkipVoiceRegister(input: {
  fcmToken: string;
  twilioIdentity: string;
  voipPushToken: string | null;
}): boolean {
  const k = voiceKey(input);
  const s = lastVoiceOk;
  if (!s) return false;
  return s.key === k && Date.now() - s.at < SUCCESS_COOLDOWN_MS;
}

export function recordPushRegisterSuccess(fcmToken: string): void {
  lastPushOk = { key: pushKey(fcmToken), at: Date.now() };
}

export function recordVoiceRegisterSuccess(input: {
  fcmToken: string;
  twilioIdentity: string;
  voipPushToken: string | null;
}): void {
  lastVoiceOk = { key: voiceKey(input), at: Date.now() };
}

/** After a failed ack (401, invalid JSON, or body ok !== true), allow immediate retry (not blocked by cooldown). */
export function clearPushRegisterCooldown(): void {
  lastPushOk = null;
}

export function clearVoiceRegisterCooldown(): void {
  lastVoiceOk = null;
}

export function getPushCooldownDebug(): { key: string | null; ageMs: number | null } {
  if (!lastPushOk) return { key: null, ageMs: null };
  return { key: lastPushOk.key.slice(0, 24) + '…', ageMs: Date.now() - lastPushOk.at };
}

export function getVoiceCooldownDebug(): { key: string | null; ageMs: number | null } {
  if (!lastVoiceOk) return { key: null, ageMs: null };
  return { key: lastVoiceOk.key.slice(0, 48) + '…', ageMs: Date.now() - lastVoiceOk.at };
}

/** When FCM token rotates, prior success keys no longer match — no explicit reset needed. */
