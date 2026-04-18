import Constants from 'expo-constants';

import type { SoftphoneTokenResponse } from './authTokenService';
import { fetchSoftphoneAccessToken } from './authTokenService';
import { getStoredSupabaseAccessToken } from './supabaseAccessTokenStore';
import { twilioVoiceService } from './twilioVoiceService';

/**
 * Registers native Twilio Voice using `GET /api/softphone/token` — independent of the WebView softphone
 * posting the Twilio JWT via `saintly-softphone-token` (that path remains a backup / parity check).
 *
 * @returns The Twilio softphone token response when native registration ran; otherwise `null`.
 */
export async function tryRegisterNativeTwilioFromPortalApi(
  reason: string
): Promise<SoftphoneTokenResponse | null> {
  if (Constants.appOwnership === 'expo') {
    return null;
  }

  const bearerFromStore = await getStoredSupabaseAccessToken();
  if (bearerFromStore) {
    const r = await fetchSoftphoneAccessToken({
      getAccessToken: async () => bearerFromStore,
    });
    if (r.token) {
      const identity = typeof r.identity === 'string' ? r.identity.trim() : '';
      console.warn('[SAINTLY-NATIVE-AUTH] initializeWithToken_call', {
        path: 'bearer',
        reason,
        identityTail: identity.slice(-12),
      });
      console.warn('[SAINTLY-VOICE] native API register (bearer)', { reason, identityTail: identity.slice(-12) });
      await twilioVoiceService.initializeWithToken({ token: r.token, identity });
      return r;
    }
  }

  const rCookie = await fetchSoftphoneAccessToken({ credentialsInclude: true });
  if (rCookie.token) {
    const identity = typeof rCookie.identity === 'string' ? rCookie.identity.trim() : '';
    console.warn('[SAINTLY-NATIVE-AUTH] initializeWithToken_call', {
      path: 'cookie_fallback',
      reason,
      identityTail: identity.slice(-12),
    });
    console.warn('[SAINTLY-VOICE] native API register (credentials)', { reason, identityTail: identity.slice(-12) });
    await twilioVoiceService.initializeWithToken({ token: rCookie.token, identity });
    return rCookie;
  }

  console.warn('[SAINTLY-VOICE] native API register skipped', {
    reason,
    bearerLen: bearerFromStore?.length ?? 0,
    errBearer: bearerFromStore ? 'bearer_failed' : 'no_bearer',
    errCookie: rCookie.error ?? 'no_token',
  });
  return null;
}
