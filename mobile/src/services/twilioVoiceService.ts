import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { SoftphoneTokenResponse } from './authTokenService';

/**
 * Twilio Voice (React Native) — production façade.
 *
 * iOS: `initializePushRegistry` + `register(token)` wires PushKit → Twilio → CallKit (system incoming UI).
 * Android: `register` binds FCM with Twilio’s FCM integration when Twilio Console credentials are set.
 *
 * The WebView must not use @twilio/voice-sdk when this shell owns calls — all control goes through here.
 *
 * Native module is loaded dynamically so Expo Go does not require it at bundle parse time.
 */
export type TwilioVoiceCallInfo = {
  id: string;
  from?: string;
  to?: string;
  customParameters?: Record<string, string>;
};

/** Payloads native code sends to WebView via injected `saintly-native-call-to-web` (see web `native-call-shell.ts`). */
export type NativeCallToWebDetail =
  | {
      kind: 'incoming_ring';
      callId: string;
      from?: string;
      to?: string;
      customParameters?: Record<string, string>;
    }
  | { kind: 'call_connected'; callId: string; direction: 'inbound' | 'outbound' }
  | { kind: 'call_disconnected'; callId: string }
  | { kind: 'mute_changed'; muted: boolean }
  | { kind: 'speaker_changed'; enabled: boolean };

export type TwilioVoiceService = {
  prepareIosPushRegistryEarly: () => Promise<void>;
  initializeWithToken: (response: SoftphoneTokenResponse) => Promise<void>;
  getNativeDeviceToken: () => Promise<string | null>;
  destroy: () => Promise<void>;
  onIncomingCall: (handler: (call: TwilioVoiceCallInfo) => void) => () => void;
  /** Current Twilio Client leg CallSid for workspace API calls (hold, transfer, end-call). */
  getActiveCallSid: () => string | null;
  answer: (callId: string) => Promise<void>;
  decline: (callId: string) => Promise<void>;
  disconnect: (callId: string) => Promise<void>;
  /** End active call, or reject ringing invite, or no-op (e.g. stuck "connecting" UI). */
  disconnectAny: () => Promise<void>;
  connectOutbound: (input: {
    toE164: string;
    outboundCli?: 'block' | string;
  }) => Promise<void>;
  setCallMuted: (muted: boolean) => Promise<void>;
  sendDigits: (digits: string) => Promise<void>;
  setOutputSpeaker: (enabled: boolean) => Promise<void>;
  getOutputSpeaker: () => Promise<boolean | null>;
  setNativeCallBridgeListener: (handler: ((detail: NativeCallToWebDetail) => void) | null) => void;
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

/** Resolved {@link Call} from `@twilio/voice-react-native-sdk` (avoid importing type at top for Expo Go). */
type TwilioCallNative = {
  disconnect: () => Promise<void>;
  mute: (muted: boolean) => Promise<boolean>;
  sendDigits: (digits: string) => Promise<void>;
  getSid: () => string | undefined;
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
let primaryActiveCallSid: string | null = null;
let nativeCallBridgeListener: ((detail: NativeCallToWebDetail) => void) | null = null;

function emitToWeb(detail: NativeCallToWebDetail): void {
  try {
    nativeCallBridgeListener?.(detail);
  } catch (e) {
    if (__DEV__) {
      console.warn('[twilioVoiceService] native bridge listener', e);
    }
  }
}

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

/** Twilio `AudioDevice.Type` string values (see SDK `AudioDevice.d.ts`). */
const TWILIO_AUDIO: { readonly speaker: 'speaker'; readonly earpiece: 'earpiece' } = {
  speaker: 'speaker',
  earpiece: 'earpiece',
};

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

function readCallSid(call: Pick<TwilioCallNative, 'getSid'>): string {
  const s = call.getSid();
  return typeof s === 'string' && s.startsWith('CA') ? s : '';
}

/**
 * Track primary Client leg CallSid (invite id often matches until reconnect — we key by resolved getSid() when present).
 */
function setPrimaryActiveSid(sid: string | null): void {
  primaryActiveCallSid = sid && sid.startsWith('CA') ? sid : null;
}

async function wireActiveCall(call: TwilioCallNative, direction: 'inbound' | 'outbound', inviteSid?: string): Promise<void> {
  const mod = await loadVoiceModule();
  const { Call } = mod;

  call.on(Call.Event.Disconnected, () => {
    let removedSid: string | null = null;
    for (const [k, v] of activeCallByCallSid.entries()) {
      if (v === call) {
        removedSid = k;
        activeCallByCallSid.delete(k);
        break;
      }
    }
    const dsid = removedSid || readCallSid(call) || inviteSid || '';
    if (dsid.startsWith('CA') && primaryActiveCallSid === dsid) {
      setPrimaryActiveSid(null);
    }
    if (dsid.startsWith('CA')) {
      emitToWeb({ kind: 'call_disconnected', callId: dsid });
    }
  });

  let sid = readCallSid(call);
  if (!sid && inviteSid?.startsWith('CA')) {
    sid = inviteSid;
  }

  const attachBySid = (finalSid: string): void => {
    activeCallByCallSid.set(finalSid, call);
    setPrimaryActiveSid(finalSid);
    emitToWeb({ kind: 'call_connected', callId: finalSid, direction });
  };

  if (sid.startsWith('CA')) {
    attachBySid(sid);
    return;
  }

  call.on(Call.Event.Connected, () => {
    const after = readCallSid(call);
    if (after.startsWith('CA')) {
      attachBySid(after);
    } else if (inviteSid?.startsWith('CA')) {
      attachBySid(inviteSid);
    } else {
      console.warn('[twilioVoiceService] Connected but no CallSid');
    }
  });
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
    const info: TwilioVoiceCallInfo = {
      id: sid,
      from: invite.getFrom(),
      to: invite.getTo(),
      customParameters: custom,
    };
    emitIncoming(info);
    emitToWeb({
      kind: 'incoming_ring',
      callId: sid,
      from: info.from,
      to: info.to,
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

  setNativeCallBridgeListener(handler: ((detail: NativeCallToWebDetail) => void) | null): void {
    nativeCallBridgeListener = handler;
  },

  getActiveCallSid(): string | null {
    return primaryActiveCallSid;
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
    setPrimaryActiveSid(null);

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
    const call = (await invite.accept()) as TwilioCallNative;
    inviteByCallSid.delete(callId);
    await wireActiveCall(call, 'inbound', callId);
  },

  async decline(callId: string): Promise<void> {
    const invite = inviteByCallSid.get(callId);
    if (!invite) return;
    await invite.reject();
    inviteByCallSid.delete(callId);
    emitToWeb({ kind: 'call_disconnected', callId });
  },

  async disconnect(callId: string): Promise<void> {
    const call = activeCallByCallSid.get(callId);
    if (!call) {
      const inv = inviteByCallSid.get(callId);
      if (inv) {
        await inv.reject().catch(() => {});
        inviteByCallSid.delete(callId);
      }
      return;
    }
    try {
      await call.disconnect();
    } catch {
      /* ignore */
    }
    activeCallByCallSid.delete(callId);
    if (primaryActiveCallSid === callId) {
      setPrimaryActiveSid(null);
    }
  },

  async disconnectAny(): Promise<void> {
    const prim = primaryActiveCallSid;
    if (prim) {
      const call = activeCallByCallSid.get(prim);
      if (call) {
        try {
          await call.disconnect();
        } catch {
          /* ignore */
        }
        activeCallByCallSid.delete(prim);
      }
      setPrimaryActiveSid(null);
      return;
    }
    for (const id of [...inviteByCallSid.keys()]) {
      const inv = inviteByCallSid.get(id);
      if (inv) {
        await inv.reject().catch(() => {});
        inviteByCallSid.delete(id);
      }
    }
    for (const id of [...activeCallByCallSid.keys()]) {
      const call = activeCallByCallSid.get(id);
      if (call) {
        try {
          await call.disconnect();
        } catch {
          /* ignore */
        }
        activeCallByCallSid.delete(id);
      }
    }
    setPrimaryActiveSid(null);
  },

  async connectOutbound(input: { toE164: string; outboundCli?: 'block' | string }): Promise<void> {
    if (Constants.appOwnership === 'expo' || !voiceSingleton) {
      throw new Error('[twilioVoiceService] Voice not ready');
    }
    const token = lastRegisteredToken;
    if (!token?.trim()) {
      throw new Error('[twilioVoiceService] Not registered — no token');
    }
    const to = input.toE164.trim();
    if (!to) {
      throw new Error('[twilioVoiceService] Missing destination');
    }
    const params: Record<string, string> = { To: to };
    const cli = input.outboundCli;
    if (cli === 'block') {
      params.OutboundCli = 'block';
    } else if (typeof cli === 'string' && cli.trim().startsWith('+')) {
      params.OutboundCli = cli.trim();
    }
    const call = (await voiceSingleton.connect(token, { params })) as TwilioCallNative;
    await wireActiveCall(call, 'outbound');
  },

  async setCallMuted(muted: boolean): Promise<void> {
    const sid = primaryActiveCallSid;
    if (!sid) return;
    const call = activeCallByCallSid.get(sid);
    if (!call) return;
    try {
      await call.mute(muted);
      emitToWeb({ kind: 'mute_changed', muted });
    } catch (e) {
      console.warn('[twilioVoiceService] setCallMuted', e);
    }
  },

  async sendDigits(digits: string): Promise<void> {
    const sid = primaryActiveCallSid;
    if (!sid) return;
    const call = activeCallByCallSid.get(sid);
    if (!call) return;
    const s = digits.replace(/[^0-9*#]/g, '');
    if (!s) return;
    try {
      await call.sendDigits(s);
    } catch (e) {
      console.warn('[twilioVoiceService] sendDigits', e);
    }
  },

  async setOutputSpeaker(enabled: boolean): Promise<void> {
    if (Constants.appOwnership === 'expo' || !voiceSingleton) {
      return;
    }
    try {
      const target = enabled ? TWILIO_AUDIO.speaker : TWILIO_AUDIO.earpiece;
      const { audioDevices } = await voiceSingleton.getAudioDevices();
      const match = audioDevices.find((d: { type: string }) => d.type === target);
      if (!match) {
        if (__DEV__) {
          console.warn('[twilioVoiceService] setOutputSpeaker: no device for', target, {
            available: audioDevices.map((d: { type: string }) => d.type),
          });
        }
        return;
      }
      await match.select();
      emitToWeb({ kind: 'speaker_changed', enabled });
    } catch (e) {
      console.warn('[twilioVoiceService] setOutputSpeaker failed', e);
    }
  },

  async getOutputSpeaker(): Promise<boolean | null> {
    if (Constants.appOwnership === 'expo' || !voiceSingleton) {
      return null;
    }
    try {
      const { selectedDevice } = await voiceSingleton.getAudioDevices();
      if (!selectedDevice) return false;
      return selectedDevice.type === TWILIO_AUDIO.speaker;
    } catch (e) {
      console.warn('[twilioVoiceService] getOutputSpeaker failed', e);
      return null;
    }
  },
};
