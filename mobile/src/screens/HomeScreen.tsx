import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';

import {
  DEFAULT_PRODUCTION_API_ORIGIN,
  env,
  mobileDiagnosticsEnabled,
  mobileRegistrationDebugEnabled,
  pushRegisterUrl,
  voiceRegisterUrl,
} from '../config/env';
import { useNativePushRegistration } from '../hooks/useNativePushRegistration';
import { tryRegisterNativeTwilioFromPortalApi } from '../services/nativeSoftphoneApiRegistration';
import { registerNativeTwilioWithAccessToken } from '../services/nativeTwilioVoiceBridge';
import { setStoredSupabaseAccessToken } from '../services/supabaseAccessTokenStore';
import { twilioVoiceService } from '../services/twilioVoiceService';
import { colors } from '../theme/colors';
import {
  clearPushRegisterCooldown,
  clearVoiceRegisterCooldown,
  getPushCooldownDebug,
  getVoiceCooldownDebug,
  recordPushRegisterSuccess,
  recordVoiceRegisterSuccess,
  shouldSkipPushRegister,
  shouldSkipVoiceRegister,
} from '../services/mobileRegistrationGuard';
import { logRegistrationDebug, registrationStats } from '../services/mobileRegistrationDiagnostics';
import { getOrCreateDeviceInstallId } from '../services/deviceInstallId';

import type { HomeScreenProps } from '../navigation/types';

/**
 * Stagger heavy native/API startup so WebView first paint stays responsive (~first 20s).
 * Does not remove retries — only delays the initial burst that overlapped keypad load + FCM.
 */
const STARTUP_SOFTPHONE_FIRST_RUN_MS = 900;
const STARTUP_PUSH_AFTER_LOAD_MS = 450;

/** Workspace phone keypad; base from `env` (see `app.config.ts` / `EXPO_PUBLIC_API_BASE_URL`). */
function portalUrl(): string {
  const base = env.apiBaseUrl.replace(/\/$/, '') || DEFAULT_PRODUCTION_API_ORIGIN;
  return `${base}/workspace/phone/keypad`;
}

/** Injected into the WebView — POST FCM to portal `user_push_devices` (cookie session). */
function buildRegisterPushInjectJs(
  fcmToken: string,
  deviceInstallId: string,
  attemptReason: string,
  diagnostics: boolean
): string {
  const registerUrl = pushRegisterUrl();
  /** SMS FCM on iOS uses APNs; server persists lowercase `ios` | `android`. */
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const bodyStr = JSON.stringify({ fcmToken, platform, deviceInstallId });
  const reasonJson = JSON.stringify(attemptReason);
  const tokenHint = `${fcmToken.slice(0, 24)}… (len ${fcmToken.length})`;
  const tokenHintJson = JSON.stringify(tokenHint);
  const diag = diagnostics ? 'true' : 'false';
  return `(function(){
  var attemptReason = ${reasonJson};
  var tokenHint = ${tokenHintJson};
  var url = ${JSON.stringify(registerUrl)};
  var body = ${JSON.stringify(bodyStr)};
  var diagnostics = ${diag};
  function post(log) {
    if (!diagnostics) return;
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(log));
      }
    } catch (e) {}
  }
  post({ type: 'push-register-log', step: 'fetch_start', ts: Date.now(), attemptReason: attemptReason, tokenHint: tokenHint, url: url });
  fetch(url, {
    method: 'POST',
    credentials: 'include',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: body
  }).then(function (res) {
    return res.text().then(function (text) {
      var bodyOk = false;
      try {
        var j = JSON.parse(text);
        bodyOk = Boolean(j && j.ok === true);
      } catch (e2) {}
      var ok = res.ok && bodyOk;
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'saintly-register-ack',
            kind: 'push',
            ok: ok,
            status: res.status,
            httpOk: res.ok,
            bodyOk: bodyOk
          }));
        }
      } catch (e) {}
      var sample = (text || '').slice(0, 800);
      post({
        type: 'push-register-log',
        step: 'fetch_done',
        ts: Date.now(),
        attemptReason: attemptReason,
        status: res.status,
        ok: res.ok,
        bodyOk: bodyOk,
        bodySample: sample
      });
    });
  }).catch(function (err) {
    post({
      type: 'push-register-log',
      step: 'fetch_error',
      ts: Date.now(),
      attemptReason: attemptReason,
      message: String(err && err.message ? err.message : err)
    });
  });
  true;
})();`;
}

/** Registers this install in `devices` for ops + Realtime; does not perform Twilio SDK registration. */
function buildVoiceRegisterInjectJs(input: {
  fcmToken: string;
  twilioIdentity: string;
  platform: string;
  appVersion: string;
  deviceInstallId: string;
  voipPushToken?: string | null;
}): string {
  const url = voiceRegisterUrl();
  const bodyObj: Record<string, string> = {
    fcmToken: input.fcmToken,
    platform: input.platform,
    twilioIdentity: input.twilioIdentity,
    appVersion: input.appVersion,
    deviceInstallId: input.deviceInstallId,
  };
  const voip = typeof input.voipPushToken === 'string' ? input.voipPushToken.trim() : '';
  if (voip) {
    bodyObj.voipPushToken = voip;
  }
  const bodyStr = JSON.stringify(bodyObj);
  return `(function(){
  var url = ${JSON.stringify(url)};
  var body = ${JSON.stringify(bodyStr)};
  fetch(url, {
    method: 'POST',
    credentials: 'include',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: body
  }).then(function (res) {
    return res.text().then(function (text) {
      var bodyOk = false;
      var userPushMirrorOk = true;
      try {
        var j = JSON.parse(text);
        bodyOk = Boolean(j && j.ok === true);
        if (j && j.userPushMirrorOk === false) userPushMirrorOk = false;
      } catch (e2) {}
      var ok = res.ok && bodyOk && userPushMirrorOk;
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'saintly-register-ack',
            kind: 'voice',
            ok: ok,
            status: res.status,
            httpOk: res.ok,
            bodyOk: bodyOk,
            userPushMirrorOk: userPushMirrorOk
          }));
        }
      } catch (e) {}
    });
  }).catch(function () {});
  true;
})();`;
}

type WebViewBridgeMessage =
  | { type: 'open-settings' }
  | { type: 'saintly-supabase-access-token'; access_token?: string | null }
  | { type: 'saintly-softphone-token'; token: string; identity?: string }
  | {
      type: 'saintly-register-ack';
      kind: 'push' | 'voice';
      ok: boolean;
      status?: number;
      httpOk?: boolean;
      bodyOk?: boolean;
      userPushMirrorOk?: boolean;
    }
  | { type: 'push-register-log'; step: string; [key: string]: unknown }
  | { type: 'voice-register-log'; step: string; [key: string]: unknown }
  | { type: 'saintly-native-speaker-query' }
  | { type: 'saintly-native-speaker-set'; enabled: boolean }
  | {
      type: 'saintly-native-call';
      action: 'start_call' | 'answer_call' | 'decline_call' | 'hangup' | 'mute' | 'dtmf';
      toE164?: string;
      outboundCli?: string;
      callId?: string;
      muted?: boolean;
      digits?: string;
    };

/** Injected into the WebView so `native-speaker-bridge` can update React state (no page reload). */
function buildInjectSpeakerStateJs(enabled: boolean): string {
  return `(function(){
    try {
      window.dispatchEvent(new CustomEvent('saintly-native-speaker-state', { detail: { enabled: ${enabled ? 'true' : 'false'} } }));
    } catch (e) {}
    true;
  })();`;
}

function pushStatusLine(environment: string, fcmOk: boolean): string {
  switch (environment) {
    case 'expo_go':
      return 'Expo Go — use a TestFlight or dev build for real push and CallKit.';
    case 'development_build':
      return fcmOk
        ? 'FCM registered — SMS/call alerts enabled when the portal session is signed in.'
        : 'Development build — grant notifications and sign in to finish push setup.';
    case 'standalone':
      return fcmOk
        ? 'Push registered — SMS and inbound-call alerts active when signed in.'
        : 'Grant notifications and sign in on the keypad to enable push.';
    default:
      return 'Verifying push environment…';
  }
}

function HomeScreenInner(_props: HomeScreenProps) {
  const { state: pushState } = useNativePushRegistration();
  const pushEnv = pushState.status === 'ready' ? pushState.result.environment : null;
  const fcmToken = pushState.status === 'ready' ? pushState.result.fcmToken : null;

  const webViewRef = useRef<WebView>(null);
  const fcmTokenRef = useRef<string | null>(null);
  /** When `/api/softphone/token` posts before FCM is ready — flush POST `/voice/register` once FCM exists. */
  const pendingVoiceRegisterRef = useRef<{ twilioIdentity: string } | null>(null);
  /** Last payload used for POST /voice/register (for ack + cooldown). */
  const lastVoicePayloadRef = useRef<{
    fcmToken: string;
    twilioIdentity: string;
    voipPushToken: string | null;
    deviceInstallId: string;
  } | null>(null);
  const deviceInstallIdRef = useRef<string | null>(null);
  const [deviceInstallIdReady, setDeviceInstallIdReady] = useState(false);
  /** Push/voice WebView POST delayed retries (FCM load / softphone-token follow-ups). */
  const registrationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastNavUrlRef = useRef<string>('');
  /** Limits duplicate POST /push/register when SPA or WebView fires many URL updates during one transition. */
  const lastNavPushRegAtRef = useRef(0);
  /** After first successful load, avoid full-screen spinner on in-WebView navigations (smoother demo). */
  const hasCompletedFirstWebLoadRef = useRef(false);
  const lastNativeCallToWebJsonRef = useRef<string>('');
  const lastNativeCallToWebAtRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [portalUri, setPortalUri] = useState(portalUrl);

  const apiOrigin = env.apiBaseUrl.replace(/\/$/, '') || DEFAULT_PRODUCTION_API_ORIGIN;

  const webSource = useMemo(() => ({ uri: portalUri }), [portalUri]);

  fcmTokenRef.current = fcmToken;

  const scheduleRegistrationTimer = useCallback((fn: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      registrationTimersRef.current = registrationTimersRef.current.filter((t) => t !== id);
      fn();
    }, delayMs);
    registrationTimersRef.current.push(id);
  }, []);

  /** Cold launch: always open keypad — do not restore a previous deep link / notification path. */
  useEffect(() => {
    setPortalUri(portalUrl());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = await getOrCreateDeviceInstallId();
        if (!cancelled && id.trim()) {
          deviceInstallIdRef.current = id.trim();
          setDeviceInstallIdReady(true);
        }
      } catch (e) {
        console.warn('[HomeScreen] getOrCreateDeviceInstallId failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Surface Twilio customParameters (e.g. caller_name from server) when present. */
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return undefined;
    return twilioVoiceService.onIncomingCall((c) => {
      const name = c.customParameters?.caller_name?.trim();
      if (__DEV__ && name) {
        console.info('[twilioVoice] incoming', { callSidLen: c.id?.length ?? 0, caller_name: name });
      }
    });
  }, []);

  /** Forward native Twilio Voice events into the WebView (workspace softphone UI-only mode). */
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return undefined;
    twilioVoiceService.setNativeCallBridgeListener((detail) => {
      const wv = webViewRef.current;
      if (!wv) return;
      const json = JSON.stringify(detail);
      const now = Date.now();
      if (json === lastNativeCallToWebJsonRef.current && now - lastNativeCallToWebAtRef.current < 120) {
        return;
      }
      lastNativeCallToWebJsonRef.current = json;
      lastNativeCallToWebAtRef.current = now;
      const js = `(function(){ try { window.dispatchEvent(new CustomEvent('saintly-native-call-to-web', { detail: ${json} })); } catch (e) {} true; })();`;
      wv.injectJavaScript(js);
    });
    return () => {
      twilioVoiceService.setNativeCallBridgeListener(null);
    };
  }, []);

  const runPushRegistration = useCallback((reason: string) => {
    const token = fcmTokenRef.current;
    const installId = deviceInstallIdRef.current?.trim() ?? '';
    if (Constants.appOwnership === 'expo' || !token || !installId || !webViewRef.current) {
      return;
    }
    registrationStats.pushInjectAttempted += 1;
    if (shouldSkipPushRegister(token, installId)) {
      registrationStats.pushSkippedByGuard += 1;
      logRegistrationDebug('skip POST /push/register (cooldown)', {
        reason,
        fcmKeyTail: `${token.slice(0, 12)}…`,
        cooldown: getPushCooldownDebug(),
      });
      return;
    }
    if (mobileRegistrationDebugEnabled) {
      logRegistrationDebug('inject POST /push/register', { reason, fcmKeyTail: `${token.slice(0, 12)}…` });
    }
    webViewRef.current.injectJavaScript(
      buildRegisterPushInjectJs(token, installId, reason, mobileDiagnosticsEnabled)
    );
  }, []);

  const injectWorkspaceVoiceRegister = useCallback(
    async (twilioIdentity: string, reason: string) => {
      const t = fcmTokenRef.current;
      const installId = deviceInstallIdRef.current?.trim() ?? '';
      if (!t || !installId || !twilioIdentity || !webViewRef.current || Constants.appOwnership === 'expo') {
        return;
      }
      const voip = Platform.OS === 'ios' ? await twilioVoiceService.getNativeDeviceToken() : null;
      registrationStats.voiceInjectAttempted += 1;
      if (
        shouldSkipVoiceRegister({
          fcmToken: t,
          twilioIdentity,
          voipPushToken: voip,
          deviceInstallId: installId,
        })
      ) {
        registrationStats.voiceSkippedByGuard += 1;
        logRegistrationDebug('skip POST /voice/register (cooldown)', {
          reason,
          identityTail: twilioIdentity.slice(-12),
          cooldown: getVoiceCooldownDebug(),
        });
        return;
      }
      if (mobileRegistrationDebugEnabled) {
        logRegistrationDebug('inject POST /voice/register', { reason, identityTail: twilioIdentity.slice(-12) });
      }
      lastVoicePayloadRef.current = { fcmToken: t, twilioIdentity, voipPushToken: voip, deviceInstallId: installId };
      const appVersion = Constants.expoConfig?.version ?? '1.0.0';
      webViewRef.current.injectJavaScript(
        buildVoiceRegisterInjectJs({
          fcmToken: t,
          twilioIdentity,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          appVersion,
          deviceInstallId: installId,
          voipPushToken: voip,
        })
      );
      /** Voice POST runs with a valid session; flush SMS `user_push_devices` via `/push/register` too. */
      runPushRegistration(`after_voice_inject_${reason}`);
      scheduleRegistrationTimer(() => {
        runPushRegistration(`after_voice_inject_${reason}_2s`);
      }, 2000);
    },
    [runPushRegistration, scheduleRegistrationTimer]
  );

  /**
   * GET `/api/softphone/token` from native (Supabase bearer in SecureStore from workspace bridge, else cookie fallback),
   * then `Voice.register` + POST `/voice/register` when FCM + WebView exist.
   */
  const runNativeSoftphoneRegistration = useCallback(
    async (reason: string): Promise<void> => {
      const res = await tryRegisterNativeTwilioFromPortalApi(reason);
      if (!res?.token?.trim()) return;

      const id = typeof res.identity === 'string' ? res.identity.trim() : '';
      const t = fcmTokenRef.current;
      if (!id) return;
      if (t && webViewRef.current) {
        pendingVoiceRegisterRef.current = null;
        await injectWorkspaceVoiceRegister(id, `native_api_${reason}`);
      } else if (!t) {
        pendingVoiceRegisterRef.current = { twilioIdentity: id };
      }
    },
    [injectWorkspaceVoiceRegister]
  );

  useEffect(() => {
    if (Constants.appOwnership === 'expo') {
      return undefined;
    }
    let cancelled = false;

    const run = (reason: string): void => {
      void (async () => {
        if (cancelled) return;
        await runNativeSoftphoneRegistration(reason);
      })();
    };

    const nativeRetryTimers: ReturnType<typeof setTimeout>[] = [];
    const scheduleNativeRetry = (delayMs: number, reason: string) => {
      const id = setTimeout(() => {
        run(reason);
      }, delayMs);
      nativeRetryTimers.push(id);
    };

    scheduleNativeRetry(4000, 'retry_4s');
    scheduleNativeRetry(15000, 'retry_15s');

    /** Replaces immediate `run('mount')` — defer GET /api/softphone/token + Twilio init (see STARTUP_SOFTPHONE_FIRST_RUN_MS). */
    const mountTimer = setTimeout(() => {
      if (!cancelled) run('mount');
    }, STARTUP_SOFTPHONE_FIRST_RUN_MS);

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        run('appstate_active');
        runPushRegistration('appstate_active');
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(mountTimer);
      nativeRetryTimers.forEach(clearTimeout);
      sub.remove();
    };
  }, [runNativeSoftphoneRegistration, runPushRegistration]);

  /** After FCM token exists: retry registration — cookies may not exist until post-login navigation. */
  useEffect(() => {
    if (!fcmToken || loading || !deviceInstallIdReady || Constants.appOwnership === 'expo') return;

    const ids: ReturnType<typeof setTimeout>[] = [];
    const first = setTimeout(() => {
      registrationTimersRef.current = registrationTimersRef.current.filter((t) => t !== first);
      runPushRegistration('webview_load_end');
    }, STARTUP_PUSH_AFTER_LOAD_MS);
    ids.push(first);
    registrationTimersRef.current.push(first);

    const delaysMs = [4000, 15000];
    delaysMs.forEach((ms) => {
      const id = setTimeout(() => {
        registrationTimersRef.current = registrationTimersRef.current.filter((t) => t !== id);
        runPushRegistration(`retry_${ms}ms_after_load`);
      }, ms);
      ids.push(id);
      registrationTimersRef.current.push(id);
    });
    return () => {
      ids.forEach((id) => {
        clearTimeout(id);
        registrationTimersRef.current = registrationTimersRef.current.filter((t) => t !== id);
      });
    };
  }, [fcmToken, loading, deviceInstallIdReady, runPushRegistration]);

  /** FCM arrived after WebView posted softphone token — complete `devices` row (incl. voip_token). */
  useEffect(() => {
    if (!fcmToken || loading || Constants.appOwnership === 'expo') return;
    const pending = pendingVoiceRegisterRef.current;
    if (!pending?.twilioIdentity || !webViewRef.current) return;
    pendingVoiceRegisterRef.current = null;
    void injectWorkspaceVoiceRegister(pending.twilioIdentity, 'fcm_ready_after_softphone_bridge');
  }, [fcmToken, loading, deviceInstallIdReady, injectWorkspaceVoiceRegister]);

  /**
   * Notification open: cold start (`getInitialNotification`), background (`onNotificationOpenedApp`).
   * Navigates WebView to `data.open_path` (portal path). Foreground message receipt does not navigate.
   */
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;

    const openFromMessage = (m: { data?: Record<string, unknown> } | null | undefined) => {
      const raw = m?.data?.open_path;
      const path = typeof raw === 'string' ? raw : null;
      if (path && path.startsWith('/')) {
        setPortalUri(`${apiOrigin}${path}`);
      }
    };

    let cancelled = false;
    let unsubOpen: (() => void) | undefined;

    void (async () => {
      const messaging = (await import('@react-native-firebase/messaging')).default;
      if (cancelled) return;

      const m = messaging();
      const initial = await m.getInitialNotification();
      if (initial) {
        openFromMessage(initial);
      }

      unsubOpen = m.onNotificationOpenedApp((remoteMessage) => {
        openFromMessage(remoteMessage);
      });
    })();

    return () => {
      cancelled = true;
      unsubOpen?.();
    };
  }, [apiOrigin]);

  const onWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const raw = event.nativeEvent.data;
        const msg = JSON.parse(raw) as WebViewBridgeMessage;
        if (msg.type === 'saintly-register-ack') {
          const ack = msg as WebViewBridgeMessage & {
            type: 'saintly-register-ack';
            kind: 'push' | 'voice';
            ok?: boolean;
            status?: number;
            httpOk?: boolean;
            bodyOk?: boolean;
            userPushMirrorOk?: boolean;
          };
          if (ack.ok) {
            const tok = fcmTokenRef.current;
            if (ack.kind === 'push' && tok) {
              const install = deviceInstallIdRef.current?.trim() ?? '';
              if (install) {
                recordPushRegisterSuccess(tok, install);
              }
              registrationStats.pushAckSuccess += 1;
            }
            if (ack.kind === 'voice' && lastVoicePayloadRef.current) {
              recordVoiceRegisterSuccess(lastVoicePayloadRef.current);
              registrationStats.voiceAckSuccess += 1;
            }
            logRegistrationDebug('register-ack success (cooldown armed)', {
              kind: ack.kind,
              status: ack.status,
              stats: { ...registrationStats },
            });
          } else {
            if (ack.kind === 'push') {
              clearPushRegisterCooldown();
              registrationStats.pushAckFailure += 1;
            } else {
              clearVoiceRegisterCooldown();
              registrationStats.voiceAckFailure += 1;
            }
            logRegistrationDebug('register-ack failure (cooldown cleared for retry)', {
              kind: ack.kind,
              status: ack.status,
              httpOk: ack.httpOk,
              bodyOk: ack.bodyOk,
              userPushMirrorOk: ack.userPushMirrorOk,
            });
          }
          return;
        }
        if (msg.type === 'push-register-log') {
          if (mobileDiagnosticsEnabled) {
            console.warn('[push-register]', msg.step, msg);
          }
          return;
        }
        if (msg.type === 'voice-register-log') {
          return;
        }
        if (msg.type === 'open-settings') {
          void Linking.openSettings();
        }
        if (msg.type === 'saintly-supabase-access-token') {
          void (async () => {
            const tokRaw = (msg as { access_token?: string | null }).access_token;
            const tok = typeof tokRaw === 'string' && tokRaw.trim() ? tokRaw.trim() : null;
            await setStoredSupabaseAccessToken(tok);
            await runNativeSoftphoneRegistration('supabase_access_token_bridge');
          })();
        }
        if (msg.type === 'saintly-native-speaker-query') {
          void (async () => {
            const on = await twilioVoiceService.getOutputSpeaker();
            if (typeof on === 'boolean' && webViewRef.current) {
              webViewRef.current.injectJavaScript(buildInjectSpeakerStateJs(on));
            }
          })();
          return;
        }
        if (msg.type === 'saintly-native-speaker-set' && typeof msg.enabled === 'boolean') {
          void (async () => {
            await twilioVoiceService.setOutputSpeaker(msg.enabled);
            const on = await twilioVoiceService.getOutputSpeaker();
            if (typeof on === 'boolean' && webViewRef.current) {
              webViewRef.current.injectJavaScript(buildInjectSpeakerStateJs(on));
            }
          })();
          return;
        }
        if (msg.type === 'saintly-native-call') {
          void (async () => {
            const m = msg as WebViewBridgeMessage & { type: 'saintly-native-call' };
            try {
              if (m.action === 'start_call' && typeof m.toE164 === 'string') {
                const cli = m.outboundCli;
                await twilioVoiceService.connectOutbound({
                  toE164: m.toE164.trim(),
                  outboundCli:
                    cli === 'block'
                      ? 'block'
                      : typeof cli === 'string' && cli.trim().startsWith('+')
                        ? cli.trim()
                        : undefined,
                });
              } else if (m.action === 'answer_call' && typeof m.callId === 'string') {
                await twilioVoiceService.answer(m.callId);
              } else if (m.action === 'decline_call' && typeof m.callId === 'string') {
                await twilioVoiceService.decline(m.callId);
              } else if (m.action === 'hangup') {
                const id = typeof m.callId === 'string' ? m.callId.trim() : '';
                if (id) {
                  await twilioVoiceService.disconnect(id);
                } else {
                  await twilioVoiceService.disconnectAny();
                }
              } else if (m.action === 'mute' && typeof m.muted === 'boolean') {
                await twilioVoiceService.setCallMuted(m.muted);
              } else if (m.action === 'dtmf' && typeof m.digits === 'string') {
                await twilioVoiceService.sendDigits(m.digits);
              }
            } catch (e) {
              console.warn('[HomeScreen] saintly-native-call', m.action, e);
            }
          })();
          return;
        }
        if (msg.type === 'saintly-softphone-token' && typeof msg.token === 'string') {
          const identity = typeof msg.identity === 'string' ? msg.identity.trim() : '';
          void (async () => {
            try {
              await registerNativeTwilioWithAccessToken(msg.token, identity);
            } catch (e) {
              if (__DEV__) {
                console.warn('[HomeScreen] registerNativeTwilioWithAccessToken', e);
              }
            }
            const t = fcmTokenRef.current;
            if (identity && t && webViewRef.current && Constants.appOwnership !== 'expo') {
              pendingVoiceRegisterRef.current = null;
              await injectWorkspaceVoiceRegister(identity, 'after_softphone_token');
            } else if (identity && !t) {
              pendingVoiceRegisterRef.current = { twilioIdentity: identity };
            }
            const tAfter = fcmTokenRef.current;
            if (tAfter) {
              scheduleRegistrationTimer(() => {
                runPushRegistration('after_softphone_token');
              }, 0);
              scheduleRegistrationTimer(() => {
                runPushRegistration('after_softphone_token_delay_2s');
              }, 2000);
            }
          })();
        }
      } catch {
        // ignore non-JSON messages
      }
    },
    [runPushRegistration, injectWorkspaceVoiceRegister, runNativeSoftphoneRegistration, scheduleRegistrationTimer]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={webSource}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          onLoadStart={() => {
            if (!hasCompletedFirstWebLoadRef.current) {
              setLoading(true);
            }
          }}
          onLoadEnd={() => {
            setLoading(false);
            hasCompletedFirstWebLoadRef.current = true;
          }}
          onNavigationStateChange={(navState) => {
            const url = navState.url ?? '';
            if (url === lastNavUrlRef.current) return;
            lastNavUrlRef.current = url;
            if (!fcmTokenRef.current || Constants.appOwnership === 'expo') return;
            if (url.includes('/workspace/phone')) {
              const now = Date.now();
              if (now - lastNavPushRegAtRef.current < 1400) return;
              lastNavPushRegAtRef.current = now;
              runPushRegistration('navigation_to_workspace_phone');
            }
          }}
          onMessage={onWebViewMessage}
          allowsBackForwardNavigationGestures
        />
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}

        {__DEV__ ? (
          <View style={styles.pushBar} pointerEvents="none">
            {pushEnv ? (
              <Text style={styles.pushText}>{pushStatusLine(pushEnv, Boolean(fcmToken))}</Text>
            ) : (
              <Text style={styles.pushText}>Preparing call environment…</Text>
            )}
            {Platform.OS === 'ios' ? (
              <Text style={styles.pushTextMuted}>
                Microphone access is requested when you place or answer a call in the keypad. Incoming calls use CallKit
                when Twilio VoIP push is configured.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

HomeScreenInner.displayName = 'HomeScreen';

export const HomeScreen = memo(HomeScreenInner);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
    minHeight: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  pushBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(244, 247, 251, 0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  pushText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  pushTextMuted: {
    marginTop: 4,
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
