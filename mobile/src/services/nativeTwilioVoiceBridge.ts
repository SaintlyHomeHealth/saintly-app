import { Platform } from 'react-native';
import Constants from 'expo-constants';

import type { Voice } from '@twilio/voice-react-native-sdk';

let voiceSingleton: Voice | null = null;
let lastRegisteredAccessToken: string | null = null;

/**
 * Twilio Voice React Native + PushKit (iOS) for CallKit incoming-call UI.
 * Requires Twilio Console: VoIP Push Credential bound to the TwiML / Voice app.
 *
 * Skipped in Expo Go (no native module).
 */
export async function registerNativeTwilioWithAccessToken(accessToken: string): Promise<void> {
  if (Constants.appOwnership === 'expo') {
    if (__DEV__) {
      console.info('[nativeTwilioVoiceBridge] Expo Go — skip Twilio Voice native registration.');
    }
    return;
  }
  const token = accessToken.trim();
  if (!token) return;
  if (lastRegisteredAccessToken === token) {
    return;
  }

  const { Voice } = await import('@twilio/voice-react-native-sdk');
  if (!voiceSingleton) {
    voiceSingleton = new Voice();
  }

  if (Platform.OS === 'ios') {
    await voiceSingleton.initializePushRegistry();
  }

  await voiceSingleton.register(token);
  lastRegisteredAccessToken = token;
}
