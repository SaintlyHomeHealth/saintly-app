import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';

import {
  DEFAULT_PRODUCTION_API_ORIGIN,
  PUSH_REGISTER_URL_RESOLVED,
  env,
  logPushRegistrationEnvDiagnostics,
  pushRegisterUrl,
} from '../config/env';
import { useNativePushRegistration } from '../hooks/useNativePushRegistration';
import { requestForegroundLocationWhenNeeded } from '../services/locationPermission';
import { registerNativeTwilioWithAccessToken } from '../services/nativeTwilioVoiceBridge';
import { colors } from '../theme/colors';

import type { HomeScreenProps } from '../navigation/types';

/** Workspace phone keypad; base from `env` (see `app.config.ts` / `EXPO_PUBLIC_API_BASE_URL`). */
function portalUrl(): string {
  const base = env.apiBaseUrl.replace(/\/$/, '') || 'https://appsaintlyhomehealth.com';
  return `${base}/workspace/phone/keypad`;
}

/** Injected into the WebView — posts structured logs to RN via `postMessage` (no silent failures). */
function buildRegisterPushInjectJs(fcmToken: string, attemptReason: string): string {
  const registerUrl = pushRegisterUrl();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const bodyStr = JSON.stringify({ fcmToken, platform });
  const reasonJson = JSON.stringify(attemptReason);
  return `(function(){
  var attemptReason = ${reasonJson};
  var url = ${JSON.stringify(registerUrl)};
  var body = ${JSON.stringify(bodyStr)};
  function post(p) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: 'push-register-log' }, p)));
      } else {
        throw new Error('ReactNativeWebView.postMessage not available');
      }
    } catch (e) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'push-register-log', step: 'postMessage_failed', message: String(e) }));
        }
      } catch (_e2) {}
    }
  }
  post({ step: 'inject_begin', attemptReason: attemptReason, url: url });
  post({ step: 'url', url: url, credentials: 'include', bodyLength: body.length });
  post({ step: 'fetch_start', url: url });
  fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body
  })
    .then(function (res) {
      return res.text().then(function (text) {
        post({
          step: 'response',
          status: res.status,
          ok: res.ok,
          bodyText: text.length > 2000 ? text.slice(0, 2000) + '…' : text
        });
      });
    })
    .catch(function (err) {
      post({ step: 'fetch_error', message: String(err && err.message ? err.message : err) });
    });
  true;
})();`;
}

function isNonProductionPushApiUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2/.test(url);
}

type WebViewBridgeMessage =
  | { type: 'open-settings' }
  | { type: 'saintly-softphone-token'; token: string }
  | { type: 'push-register-log'; step: string; [key: string]: unknown };

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

export function HomeScreen(_props: HomeScreenProps) {
  const pushState = useNativePushRegistration();
  const pushEnv =
    pushState.status === 'ready' ? pushState.result.environment : null;
  const fcmToken = pushState.status === 'ready' ? pushState.result.fcmToken : null;

  const webViewRef = useRef<WebView>(null);
  const fcmTokenRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalUri, setPortalUri] = useState(portalUrl);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  const apiOrigin = env.apiBaseUrl.replace(/\/$/, '') || DEFAULT_PRODUCTION_API_ORIGIN;

  fcmTokenRef.current = fcmToken;

  /** Log once at startup — search device logs for SAINTLY-PUSH-REG */
  useEffect(() => {
    logPushRegistrationEnvDiagnostics();
    console.warn('[SAINTLY-PUSH-REG] resolved_api_base_url', env.apiBaseUrl);
    console.warn('[SAINTLY-PUSH-REG] resolved_push_register_url', PUSH_REGISTER_URL_RESOLVED);
  }, []);

  useEffect(() => {
    console.warn('[SAINTLY-PUSH-REG] portalUri', portalUri);
  }, [portalUri]);

  const lastNavUrlRef = useRef<string>('');

  const runPushRegistration = useCallback((reason: string) => {
    const token = fcmTokenRef.current;
    console.warn('[SAINTLY-PUSH-REG] attempt', {
      reason,
      hasFcmToken: Boolean(token),
      isExpoGo: Constants.appOwnership === 'expo',
      hasWebViewRef: Boolean(webViewRef.current),
    });
    if (Constants.appOwnership === 'expo') {
      console.warn('[SAINTLY-PUSH-REG] skip', { reason: 'expo_go' });
      return;
    }
    if (!token) {
      console.warn('[SAINTLY-PUSH-REG] skip', { reason: 'no_fcm_token' });
      return;
    }
    if (!webViewRef.current) {
      console.warn('[SAINTLY-PUSH-REG] skip', { reason: 'no_webview_ref' });
      return;
    }
    const url = pushRegisterUrl();
    if (isNonProductionPushApiUrl(url)) {
      console.warn('[SAINTLY-PUSH-REG] register_url_non_production', url);
    } else if (url.startsWith(DEFAULT_PRODUCTION_API_ORIGIN)) {
      console.warn('[SAINTLY-PUSH-REG] register_url_ok_production', url);
    } else {
      console.warn('[SAINTLY-PUSH-REG] register_url_custom', url);
    }
    console.warn('[SAINTLY-PUSH-REG] inject_js', { reason, url });
    webViewRef.current.injectJavaScript(buildRegisterPushInjectJs(token, reason));
  }, []);

  /** After FCM token exists: retry registration — cookies may not exist until post-login navigation. */
  useEffect(() => {
    if (!fcmToken || loading || Constants.appOwnership === 'expo') return;

    runPushRegistration('webview_load_end');
    const delaysMs = [2500, 6000, 12000, 20000, 35000];
    const timers = delaysMs.map((ms) =>
      setTimeout(() => {
        runPushRegistration(`retry_${ms}ms_after_load`);
      }, ms)
    );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [fcmToken, loading, runPushRegistration]);

  /** Open thread / keypad when user taps a notification (background → foreground). */
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
    let unsubFg: (() => void) | undefined;

    void (async () => {
      const messaging = (await import('@react-native-firebase/messaging')).default;
      if (cancelled) return;

      unsubOpen = messaging().onNotificationOpenedApp((remoteMessage) => {
        openFromMessage(remoteMessage);
      });

      const initial = await messaging().getInitialNotification();
      if (!cancelled) {
        openFromMessage(initial ?? undefined);
      }

      unsubFg = messaging().onMessage((remoteMessage) => {
        openFromMessage(remoteMessage);
      });
    })();

    return () => {
      cancelled = true;
      unsubOpen?.();
      unsubFg?.();
    };
  }, [apiOrigin]);

  const onWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const raw = event.nativeEvent.data;
        const msg = JSON.parse(raw) as WebViewBridgeMessage;
        if (msg.type === 'push-register-log') {
          const step = typeof msg.step === 'string' ? msg.step : '';
          if (step === 'response' && typeof msg.status === 'number') {
            console.warn('[SAINTLY-PUSH-REG] fetch_response', {
              status: msg.status,
              ok: msg.ok,
              bodyText: msg.bodyText,
            });
          } else if (step === 'fetch_error') {
            console.warn('[SAINTLY-PUSH-REG] fetch_network_error', msg);
          } else if (step === 'postMessage_failed') {
            console.warn('[SAINTLY-PUSH-REG] postMessage_failed', msg);
          } else {
            console.warn('[SAINTLY-PUSH-REG] webview_step', step, msg);
          }
          return;
        }
        if (msg.type === 'open-settings') {
          void Linking.openSettings();
        }
        if (msg.type === 'saintly-softphone-token' && typeof msg.token === 'string') {
          void registerNativeTwilioWithAccessToken(msg.token);
          console.warn('[SAINTLY-PUSH-REG] softphone_token_received');
          const t = fcmTokenRef.current;
          if (t) {
            setTimeout(() => {
              runPushRegistration('after_softphone_token');
            }, 0);
            setTimeout(() => {
              runPushRegistration('after_softphone_token_delay_3s');
            }, 3000);
            setTimeout(() => {
              runPushRegistration('after_softphone_token_delay_8s');
            }, 8000);
          } else {
            console.warn('[SAINTLY-PUSH-REG] softphone_token_but_no_fcm');
          }
        }
      } catch {
        // ignore non-JSON messages
      }
    },
    [runPushRegistration]
  );

  const onEnableLocation = useCallback(async () => {
    setLocationBusy(true);
    setLocationNote(null);
    try {
      const r = await requestForegroundLocationWhenNeeded();
      if (!r.granted && r.deniedMessage) {
        setLocationNote(r.deniedMessage);
      } else if (r.granted) {
        setLocationNote('Location enabled for this app. Future visit and call features can use it when needed.');
      }
    } finally {
      setLocationBusy(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ uri: portalUri }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          /** iOS 15+ — grant WKWebView media capture so Twilio Voice (getUserMedia) can acquire the mic in-app. */
          mediaCapturePermissionGrantType="grant"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(navState) => {
            const url = navState.url ?? '';
            if (url === lastNavUrlRef.current) return;
            lastNavUrlRef.current = url;
            if (!fcmTokenRef.current || Constants.appOwnership === 'expo') return;
            if (url.includes('/workspace/phone')) {
              console.warn('[SAINTLY-PUSH-REG] nav_to_workspace_phone', url);
              runPushRegistration('navigation_to_workspace_phone');
              setTimeout(() => {
                runPushRegistration('navigation_to_workspace_phone_delay_500ms');
              }, 500);
              setTimeout(() => {
                runPushRegistration('navigation_to_workspace_phone_delay_2s');
              }, 2000);
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

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Location</Text>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
              onPress={onEnableLocation}
              disabled={locationBusy}
            >
              <Text style={styles.primaryBtnText}>{locationBusy ? '…' : 'Enable'}</Text>
            </Pressable>
          </View>
          {locationNote ? <Text style={styles.cardHint}>{locationNote}</Text> : null}
          {locationNote && !locationNote.includes('enabled for this app') ? (
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
              onPress={() => void Linking.openSettings()}
            >
              <Text style={styles.secondaryBtnText}>Open Settings</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.pushBar} pointerEvents="none">
          {pushEnv ? (
            <Text style={styles.pushText}>
              {pushStatusLine(pushEnv, Boolean(fcmToken))}
            </Text>
          ) : (
            <Text style={styles.pushText}>Preparing call environment…</Text>
          )}
          {Platform.OS === 'ios' ? (
            <Text style={styles.pushTextMuted}>
              Microphone access is requested when you place or answer a call in the keypad. Incoming calls use CallKit when Twilio VoIP push is configured.
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

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
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  cardHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  primaryBtnPressed: {
    opacity: 0.88,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
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
