import Constants from 'expo-constants';

import { mobileDiagnosticsEnabled } from '../config/env';
import { voiceRegistrationDeviceLog } from '../debug/voiceRegistrationDeviceDebug';
import { diagWarn } from '../utils/mobileDiagnostics';
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

  diagWarn('[SAINTLY-TRACE] starting native bearer registration');
  voiceRegistrationDeviceLog('starting native bearer registration');

  const token = await getStoredSupabaseAccessToken();
  diagWarn('[SAINTLY-TRACE] stored Supabase token after read', {
    hasToken: Boolean(token),
    tokenLength: token?.length ?? 0,
  });

  if (token) {
    const r = await fetchSoftphoneAccessToken({
      getAccessToken: async () => token,
    });
    if (r.token) {
      const identity = typeof r.identity === 'string' ? r.identity.trim() : '';
      diagWarn('[SAINTLY-TRACE] initializeWithToken invoking', { path: 'native_api_bearer', reason });
      diagWarn('[SAINTLY-NATIVE-AUTH] initializeWithToken_call', {
        path: 'bearer',
        reason,
        identityTail: identity.slice(-12),
      });
      diagWarn('[SAINTLY-VOICE] native API register (bearer)', { reason, identityTail: identity.slice(-12) });
      await twilioVoiceService.initializeWithToken({ token: r.token, identity });
      return r;
    }
  }

  const rCookie = await fetchSoftphoneAccessToken({ credentialsInclude: true });
  if (rCookie.token) {
    const identity = typeof rCookie.identity === 'string' ? rCookie.identity.trim() : '';
    diagWarn('[SAINTLY-TRACE] initializeWithToken invoking', { path: 'native_api_cookie_fallback', reason });
    diagWarn('[SAINTLY-NATIVE-AUTH] initializeWithToken_call', {
      path: 'cookie_fallback',
      reason,
      identityTail: identity.slice(-12),
    });
    diagWarn('[SAINTLY-VOICE] native API register (credentials)', { reason, identityTail: identity.slice(-12) });
    await twilioVoiceService.initializeWithToken({ token: rCookie.token, identity });
    return rCookie;
  }

  if (mobileDiagnosticsEnabled) {
    diagWarn('[SAINTLY-VOICE] native API register skipped', {
      reason,
      bearerLen: token?.length ?? 0,
      errBearer: token ? 'bearer_failed' : 'no_bearer',
      errCookie: rCookie.error ?? 'no_token',
    });
  } else {
    console.warn('[SAINTLY-VOICE] native API register skipped (not signed in or token unavailable)');
  }
  return null;
}
