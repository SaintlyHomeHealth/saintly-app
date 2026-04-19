import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { SoftphoneTokenResponse } from './authTokenService';
import { diagWarn } from '../utils/mobileDiagnostics';

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
  | { kind: 'invite_canceled'; callId: string }
  | { kind: 'outbound_connect_failed'; message?: string; code?: string }
  | { kind: 'answer_failed'; callId: string; message?: string }
  | {
      kind: 'call_disconnected_early';
      callId?: string;
      reason: 'before_connected' | 'connect_failure' | 'unknown';
      message?: string;
    }
  | { kind: 'native_voice_error'; scope: 'voice' | 'call'; message?: string; code?: string; callId?: string }
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

function formatTwilioError(err: unknown): string | undefined {
  if (err == null) return undefined;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function readErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'number') {
    return String((err as { code: number }).code);
  }
  return undefined;
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

  let webConnectedEmitted = false;
  let connectFailureEmitted = false;

  call.on(Call.Event.ConnectFailure, (err: unknown) => {
    connectFailureEmitted = true;
    const msg = formatTwilioError(err);
    const code = readErrorCode(err);
    if (direction === 'outbound') {
      emitToWeb({ kind: 'outbound_connect_failed', message: msg, code });
    } else {
      emitToWeb({
        kind: 'native_voice_error',
        scope: 'call',
        message: msg,
        code,
        callId: inviteSid,
      });
    }
    emitToWeb({
      kind: 'call_disconnected_early',
      callId: readCallSid(call) || inviteSid,
      reason: 'connect_failure',
      message: msg,
    });
  });

  call.on(Call.Event.Disconnected, () => {
    if (connectFailureEmitted) {
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
      return;
    }

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

    if (!webConnectedEmitted) {
      emitToWeb({
        kind: 'call_disconnected_early',
        callId: dsid.startsWith('CA') ? dsid : undefined,
        reason: 'before_connected',
      });
      return;
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
    webConnectedEmitted = true;
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
      diagWarn('[twilioVoiceService] Connected but no CallSid');
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

    /**
     * CallKit / lock-screen answer accepts via the native layer without `twilioVoiceService.answer()`.
     * `CallInvite.Event.Accepted` fires for both native and in-app accept; wire the Call once here.
     */
    invite.on(CallInvite.Event.Accepted, (...args: unknown[]) => {
      const call = args[0] as TwilioCallNative;
      inviteByCallSid.delete(sid);
      void wireActiveCall(call, 'inbound', sid);
    });

    invite.on(CallInvite.Event.Cancelled, () => {
      inviteByCallSid.delete(sid);
      activeCallByCallSid.delete(sid);
      emitToWeb({ kind: 'invite_canceled', callId: sid });
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
    const msg = formatTwilioError(err);
    const code = readErrorCode(err);
    console.warn('[twilioVoiceService] Voice.Event.Error', msg ?? err);
    emitToWeb({ kind: 'native_voice_error', scope: 'voice', message: msg, code });
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
      diagWarn('[SAINTLY-VOICE] prepareIosPushRegistryEarly failed', e);
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
        diagWarn('[twilioVoiceService] getDeviceToken after register failed', e);
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
      diagWarn('[SAINTLY-VOICE] getNativeDeviceToken failed', e);
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
    const invite = inviteByCallSid.get(callId);
    if (!invite) {
      const msg = `[twilioVoiceService] No CallInvite for ${callId}`;
      emitToWeb({ kind: 'answer_failed', callId, message: msg });
      emitToWeb({ kind: 'call_disconnected_early', callId, reason: 'unknown', message: msg });
      throw new Error(msg);
    }
    try {
      await invite.accept();
      /** `CallInvite.Event.Accepted` → `wireActiveCall` (covers CallKit + in-app answer). */
    } catch (e) {
      inviteByCallSid.delete(callId);
      const msg = formatTwilioError(e);
      emitToWeb({ kind: 'answer_failed', callId, message: msg });
      emitToWeb({
        kind: 'call_disconnected_early',
        callId,
        reason: 'unknown',
        message: msg,
      });
      throw e;
    }
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
    try {
      const call = (await voiceSingleton.connect(token, { params })) as TwilioCallNative;
      await wireActiveCall(call, 'outbound');
    } catch (e) {
      const msg = formatTwilioError(e);
      const code = readErrorCode(e);
      emitToWeb({ kind: 'outbound_connect_failed', message: msg, code });
      emitToWeb({
        kind: 'call_disconnected_early',
        reason: 'unknown',
        message: msg,
      });
      throw e;
    }
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
      diagWarn('[twilioVoiceService] setCallMuted', e);
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
      diagWarn('[twilioVoiceService] sendDigits', e);
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
      diagWarn('[twilioVoiceService] setOutputSpeaker failed', e);
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
      diagWarn('[twilioVoiceService] getOutputSpeaker failed', e);
      return null;
    }
  },
};
