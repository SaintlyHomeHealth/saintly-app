/**
 * In-memory dedupe for WebView-driven POST /push/register and /voice/register.
 * Prevents redundant network work when FCM + identity + VoIP token are unchanged and
 * registration recently succeeded (cookie session still valid).
 */
const SUCCESS_COOLDOWN_MS = 50_000;

type LastOk = { key: string; at: number };

let lastPushOk: LastOk | null = null;
let lastVoiceOk: LastOk | null = null;

function pushKey(fcmToken: string, deviceInstallId: string): string {
  const install = deviceInstallId.trim();
  return `${install}|${fcmToken}`;
}

function voiceKey(input: {
  fcmToken: string;
  twilioIdentity: string;
  voipPushToken: string | null;
  deviceInstallId: string;
}): string {
  const voip = typeof input.voipPushToken === 'string' ? input.voipPushToken.trim() : '';
  return `${input.deviceInstallId.trim()}|${input.fcmToken}|${input.twilioIdentity.trim()}|${voip}`;
}

export function shouldSkipPushRegister(fcmToken: string, deviceInstallId: string): boolean {
  const k = pushKey(fcmToken, deviceInstallId);
  const s = lastPushOk;
  if (!s) return false;
  return s.key === k && Date.now() - s.at < SUCCESS_COOLDOWN_MS;
}

export function shouldSkipVoiceRegister(input: {
  fcmToken: string;
  twilioIdentity: string;
  voipPushToken: string | null;
  deviceInstallId: string;
}): boolean {
  const k = voiceKey(input);
  const s = lastVoiceOk;
  if (!s) return false;
  return s.key === k && Date.now() - s.at < SUCCESS_COOLDOWN_MS;
}

export function recordPushRegisterSuccess(fcmToken: string, deviceInstallId: string): void {
  lastPushOk = { key: pushKey(fcmToken, deviceInstallId), at: Date.now() };
}

export function recordVoiceRegisterSuccess(input: {
  fcmToken: string;
  twilioIdentity: string;
  voipPushToken: string | null;
  deviceInstallId: string;
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
