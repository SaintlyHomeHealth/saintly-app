import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { SoftphoneTokenResponse } from './authTokenService';

/**
 * Twilio Voice (React Native) — production façade.
 *
 * iOS: `initializePushRegistry` + `register(token)` wires PushKit → Twilio → CallKit (system incoming UI).
 * Android: `register` binds FCM with Twilio’s FCM integration when Twilio Console credentials are set.
 *
 * Native module is loaded dynamically so Expo Go does not require it at bundle parse time.
 */
export type TwilioVoiceCallInfo = {
  id: string;
  from?: string;
  to?: string;
  customParameters?: Record<string, string>;
};

export type TwilioVoiceService = {
  /** iOS: Twilio docs — call `initializePushRegistry()` at app launch, before `register(token)`. */
  prepareIosPushRegistryEarly: () => Promise<void>;
  initializeWithToken: (response: SoftphoneTokenResponse) => Promise<void>;
  /** iOS PushKit / device token from the native Voice layer (after register). */
  getNativeDeviceToken: () => Promise<string | null>;
  destroy: () => Promise<void>;
  onIncomingCall: (handler: (call: TwilioVoiceCallInfo) => void) => () => void;
  answer: (callId: string) => Promise<void>;
  decline: (callId: string) => Promise<void>;
  disconnect: (callId: string) => Promise<void>;
};

/** Twilio `CallInvite` / `Call` instances (typed loosely to avoid interface/class merge issues in SDK typings). */
type TwilioCallInviteNative = {
  getCallSid: () => string;
  getFrom: () => string;
  getTo: () => string;
  getCustomParameters: () => Record<string, unknown>;
  accept: (options?: object) => Promise<TwilioCallNative>;
  reject: () => Promise<void>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

type TwilioCallNative = {
  disconnect: () => Promise<void>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

let lastRegisteredToken: string | null = null;
let iosPushRegistryInitialized = false;
let iosPushRegistryInitInFlight: Promise<void> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Voice class from dynamic import
let voiceSingleton: any = null;
const inviteByCallSid = new Map<string, TwilioCallInviteNative>();
const activeCallByCallSid = new Map<string, TwilioCallNative>();
const incomingHandlers = new Set<(call: TwilioVoiceCallInfo) => void>();

function emitIncoming(info: TwilioVoiceCallInfo): void {
  incomingHandlers.forEach((fn) => {
    try {
      fn(info);
    } catch (e) {
      if (__DEV__) {
        console.warn('[twilioVoiceService] onIncomingCall handler error', e);
      }
    }
  });
}

async function loadVoiceModule(): Promise<typeof import('@twilio/voice-react-native-sdk')> {
  return import('@twilio/voice-react-native-sdk');
}

function logJwtIdentityForDiagnostics(accessToken: string, label: string): void {
  if (!__DEV__) return;
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { sub?: string; iss?: string };
    const sub = typeof json.sub === 'string' ? json.sub : null;
    console.info(`[twilioVoiceService] ${label}`, {
      jwt_sub_identity: sub,
      jwt_iss_tail: typeof json.iss === 'string' ? json.iss.slice(-12) : null,
    });
  } catch {
    // ignore parse errors
  }
}

async function ensureVoiceSingletonWithListeners(): Promise<void> {
  if (voiceSingleton) return;
  const { Voice, CallInvite } = await loadVoiceModule();
  voiceSingleton = new Voice();

  voiceSingleton.on(Voice.Event.CallInvite, (invite: TwilioCallInviteNative) => {
    const sid = invite.getCallSid();
    inviteByCallSid.set(sid, invite);

    invite.on(CallInvite.Event.Cancelled, () => {
      inviteByCallSid.delete(sid);
      activeCallByCallSid.delete(sid);
    });

    const custom = invite.getCustomParameters() as Record<string, string>;
    emitIncoming({
      id: sid,
      from: invite.getFrom(),
      to: invite.getTo(),
      customParameters: custom,
    });
  });

  voiceSingleton.on(Voice.Event.Error, (err: unknown) => {
    console.warn('[twilioVoiceService] Voice.Event.Error', err instanceof Error ? err.message : String(err));
  });

  voiceSingleton.on(Voice.Event.Registered, () => {});

  voiceSingleton.on(Voice.Event.Unregistered, () => {});
}

async function runInitializePushRegistryOnce(): Promise<void> {
  if (iosPushRegistryInitialized || !voiceSingleton) return;
  if (iosPushRegistryInitInFlight) {
    await iosPushRegistryInitInFlight;
    return;
  }
  iosPushRegistryInitInFlight = (async () => {
    try {
      await voiceSingleton.initializePushRegistry();
      iosPushRegistryInitialized = true;
    } finally {
      iosPushRegistryInitInFlight = null;
    }
  })();
  await iosPushRegistryInitInFlight;
}

export const twilioVoiceService: TwilioVoiceService = {
  async prepareIosPushRegistryEarly(): Promise<void> {
    if (Constants.appOwnership === 'expo' || Platform.OS !== 'ios') {
      return;
    }
    try {
      await ensureVoiceSingletonWithListeners();
      await runInitializePushRegistryOnce();
    } catch (e) {
      console.warn('[SAINTLY-VOICE] prepareIosPushRegistryEarly failed', e);
    }
  },

  async initializeWithToken(response: SoftphoneTokenResponse): Promise<void> {
    if (Constants.appOwnership === 'expo') {
      if (__DEV__) {
        console.info('[twilioVoiceService] Expo Go — skip native Twilio Voice.');
      }
      return;
    }

    const token = response.token.trim();
    if (!token) return;

    const identityFromApi = typeof response.identity === 'string' ? response.identity.trim() : '';
    logJwtIdentityForDiagnostics(token, 'access_token_jwt_claims');

    if (lastRegisteredToken === token && voiceSingleton) {
      return;
    }

    await ensureVoiceSingletonWithListeners();

    if (Platform.OS === 'ios') {
      await runInitializePushRegistryOnce();
    }

    await voiceSingleton.register(token);
    lastRegisteredToken = token;

    if (Platform.OS === 'ios') {
      try {
        await voiceSingleton.getDeviceToken();
      } catch (e) {
        console.warn('[twilioVoiceService] getDeviceToken after register failed', e);
      }
    }
  },

  async getNativeDeviceToken(): Promise<string | null> {
    if (Constants.appOwnership === 'expo' || Platform.OS !== 'ios' || !voiceSingleton) {
      return null;
    }
    try {
      const t = await voiceSingleton.getDeviceToken();
      return typeof t === 'string' && t.trim() ? t.trim() : null;
    } catch (e) {
      console.warn('[SAINTLY-VOICE] getNativeDeviceToken failed', e);
      return null;
    }
  },

  async destroy(): Promise<void> {
    inviteByCallSid.clear();
    for (const c of activeCallByCallSid.values()) {
      try {
        await c.disconnect();
      } catch {
        // ignore
      }
    }
    activeCallByCallSid.clear();

    if (voiceSingleton && lastRegisteredToken) {
      try {
        await voiceSingleton.unregister(lastRegisteredToken);
      } catch {
        // ignore
      }
    }
    lastRegisteredToken = null;
    iosPushRegistryInitialized = false;
    iosPushRegistryInitInFlight = null;
    voiceSingleton?.removeAllListeners?.();
    voiceSingleton = null;
  },

  onIncomingCall(handler: (call: TwilioVoiceCallInfo) => void): () => void {
    incomingHandlers.add(handler);
    return (): void => {
      incomingHandlers.delete(handler);
    };
  },

  async answer(callId: string): Promise<void> {
    const mod = await loadVoiceModule();
    const invite = inviteByCallSid.get(callId);
    if (!invite) {
      throw new Error(`[twilioVoiceService] No CallInvite for ${callId}`);
    }
    const call = await invite.accept();
    inviteByCallSid.delete(callId);
    activeCallByCallSid.set(callId, call);
    call.on(mod.Call.Event.Disconnected, () => {
      activeCallByCallSid.delete(callId);
    });
  },

  async decline(callId: string): Promise<void> {
    const invite = inviteByCallSid.get(callId);
    if (!invite) return;
    await invite.reject();
    inviteByCallSid.delete(callId);
  },

  async disconnect(callId: string): Promise<void> {
    const call = activeCallByCallSid.get(callId);
    if (!call) return;
    await call.disconnect();
    activeCallByCallSid.delete(callId);
  },
};
