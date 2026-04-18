/**
 * Bridge from the WebView (workspace softphone) to native Twilio Voice registration.
 * Keeps a single import site for screens; implementation lives in {@link twilioVoiceService}.
 */

import { twilioVoiceService } from './twilioVoiceService';

/**
 * Register PushKit (iOS) + Twilio Voice with the same access JWT as the in-webview Device.
 * `identity` must match GET `/api/softphone/token` (e.g. `saintly_<user uuid>`) for logs and parity with the browser Device.
 */
export async function registerNativeTwilioWithAccessToken(accessToken: string, identity?: string): Promise<void> {
  const id = typeof identity === 'string' ? identity.trim() : '';
  console.warn('[SAINTLY-NATIVE-AUTH] initializeWithToken_call', {
    path: 'webview_softphone_token_bridge',
    identityTail: id.slice(-12),
  });
  await twilioVoiceService.initializeWithToken({ token: accessToken, identity: id });
}
