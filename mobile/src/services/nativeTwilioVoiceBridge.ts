/**
 * Bridge from the WebView (workspace softphone) to native Twilio Voice registration.
 * Keeps a single import site for screens; implementation lives in {@link twilioVoiceService}.
 */

import { twilioVoiceService } from './twilioVoiceService';

/**
 * Register PushKit (iOS) + Twilio Voice with the same access JWT as the in-webview Device.
 */
export async function registerNativeTwilioWithAccessToken(accessToken: string): Promise<void> {
  await twilioVoiceService.initializeWithToken({ token: accessToken, identity: '' });
}
