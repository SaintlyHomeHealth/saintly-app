import type { SoftphoneTokenResponse } from './authTokenService';

/**
 * Twilio Voice (React Native) — production-oriented façade.
 *
 * Wire `@twilio/voice-react-native-sdk` (or Twilio’s current RN package) inside a development build.
 * Do not ship Twilio Account credentials in the app; only short-lived JWTs from `authTokenService`.
 */

export type TwilioVoiceCallInfo = {
  /** Twilio Call SID or SDK call id when available. */
  id: string;
  from?: string;
  to?: string;
  /** Raw custom parameters from Twilio when present. */
  customParameters?: Record<string, string>;
};

export type TwilioVoiceService = {
  /** Register device with Twilio using JWT from `fetchSoftphoneAccessToken`. */
  initializeWithToken: (response: SoftphoneTokenResponse) => Promise<void>;

  /** Tear down native audio / Twilio device. */
  destroy: () => Promise<void>;

  /**
   * TODO: Subscribe to incoming PSTN / Client legs after `initializeWithToken`.
   * Register listeners on the native Twilio Voice SDK (incoming event).
   */
  onIncomingCall: (handler: (call: TwilioVoiceCallInfo) => void) => () => void;

  /**
   * TODO: Answer the ringing call (native SDK).
   */
  answer: (callId: string) => Promise<void>;

  /**
   * TODO: Reject / decline incoming call.
   */
  decline: (callId: string) => Promise<void>;

  /**
   * TODO: Hang up active call.
   */
  disconnect: (callId: string) => Promise<void>;
};

const noopUnsub = (): void => {};

const notImplemented = async (): Promise<void> => {
  if (__DEV__) {
    console.info('[twilioVoiceService] Native Twilio Voice SDK not linked — no-op.');
  }
};

/**
 * Placeholder until the native Twilio Voice module is added (dev build).
 * Swap implementation in one place when the SDK is installed.
 */
export const twilioVoiceService: TwilioVoiceService = {
  initializeWithToken: notImplemented,

  destroy: notImplemented,

  onIncomingCall: () => {
    if (__DEV__) {
      console.info('[twilioVoiceService] onIncomingCall — TODO: wire Twilio RN incoming listener.');
    }
    return noopUnsub;
  },

  answer: async (callId: string) => {
    if (__DEV__) {
      console.info('[twilioVoiceService] answer — TODO:', callId);
    }
  },

  decline: async (callId: string) => {
    if (__DEV__) {
      console.info('[twilioVoiceService] decline — TODO:', callId);
    }
  },

  disconnect: async (callId: string) => {
    if (__DEV__) {
      console.info('[twilioVoiceService] disconnect — TODO:', callId);
    }
  },
};
