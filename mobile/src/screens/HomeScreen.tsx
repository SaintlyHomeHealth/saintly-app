import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
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
  const base = env.apiBaseUrl.replace(/\/$/, '') || DEFAULT_PRODUCTION_API_ORIGIN;
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
  post({
    step: 'register_meta',
    url: url,
    method: 'POST',
    payload: body,
    redirect: 'follow',
    credentials: 'include'
  });
  fetch(url, {
    method: 'POST',
    credentials: 'include',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: body
  })
    .then(function (res) {
      return res.text().then(function (text) {
        var raw = text.length > 6000 ? text.slice(0, 6000) + '…[truncated]' : text;
        post({
          step: 'register_done',
          status: res.status,
          ok: res.ok,
          rawText: raw
        });
      });
    })
    .catch(function (err) {
      post({
        step: 'register_throw',
        name: err && err.name ? String(err.name) : 'Error',
        message: err && err.message ? String(err.message) : String(err),
        stack: err && err.stack ? String(err.stack) : ''
      });
    });
  true;
})();`;
}

/** GET fetch to same host as WebView — avoids cross-subdomain cookie / fetch issues vs www. */
function buildPingRegisterInjectJs(): string {
  const registerUrl = pushRegisterUrl();
  return `(function(){
  var url = ${JSON.stringify(registerUrl)};
  function post(p) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: 'push-register-log' }, p)));
      }
    } catch (e) {}
  }
  post({ step: 'ping_meta', url: url, method: 'GET', redirect: 'follow', credentials: 'include' });
  fetch(url, { method: 'GET', credentials: 'include', redirect: 'follow' })
    .then(function (res) {
      return res.text().then(function (text) {
        var raw = text.length > 6000 ? text.slice(0, 6000) + '…[truncated]' : text;
        post({
          step: 'ping_done',
          status: res.status,
          ok: res.ok,
          rawText: raw
        });
      });
    })
    .catch(function (err) {
      post({
        step: 'ping_throw',
        name: err && err.name ? String(err.name) : 'Error',
        message: err && err.message ? String(err.message) : String(err),
        stack: err && err.stack ? String(err.stack) : ''
      });
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
  const { state: pushState, refreshRegistration } = useNativePushRegistration();
  const pushEnv =
    pushState.status === 'ready' ? pushState.result.environment : null;
  const fcmToken = pushState.status === 'ready' ? pushState.result.fcmToken : null;
  const nativePushDetail = pushState.status === 'ready' ? pushState.result : null;

  const webViewRef = useRef<WebView>(null);
  const fcmTokenRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalUri, setPortalUri] = useState(portalUrl);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  /** TEMP: on-screen push registration debug (remove after device is verified). */
  const [lastRegAttemptReason, setLastRegAttemptReason] = useState<string>('—');
  const [currentWebViewUrl, setCurrentWebViewUrl] = useState<string>('—');
  const [webViewRefAttached, setWebViewRefAttached] = useState(false);
  const [regReqSummary, setRegReqSummary] = useState<string>('—');
  const [regResSummary, setRegResSummary] = useState<string>('—');
  const [regThrowSummary, setRegThrowSummary] = useState<string>('—');
  const [pingReqSummary, setPingReqSummary] = useState<string>('—');
  const [pingResSummary, setPingResSummary] = useState<string>('—');
  const [pingThrowSummary, setPingThrowSummary] = useState<string>('—');
  const [pushRefreshBusy, setPushRefreshBusy] = useState(false);

  const apiOrigin = env.apiBaseUrl.replace(/\/$/, '') || DEFAULT_PRODUCTION_API_ORIGIN;

  fcmTokenRef.current = fcmToken;

  /** Cold launch: always open keypad — do not restore a previous deep link / notification path. */
  useEffect(() => {
    setPortalUri(portalUrl());
  }, []);

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
    setLastRegAttemptReason(reason);
    console.warn('[SAINTLY-PUSH-REG] attempt', {
      reason,
      hasFcmToken: Boolean(token),
      isExpoGo: Constants.appOwnership === 'expo',
      hasWebViewRef: Boolean(webViewRef.current),
    });
    if (Constants.appOwnership === 'expo') {
      setLastRegAttemptReason(`${reason} → skipped_expo_go`);
      console.warn('[SAINTLY-PUSH-REG] skip', { reason: 'expo_go' });
      return;
    }
    if (!token) {
      setLastRegAttemptReason(`${reason} → skipped_no_fcm_token`);
      console.warn('[SAINTLY-PUSH-REG] skip', { reason: 'no_fcm_token' });
      return;
    }
    if (!webViewRef.current) {
      setLastRegAttemptReason(`${reason} → skipped_no_webview_ref`);
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
    setRegReqSummary('…');
    setRegResSummary('…');
    setRegThrowSummary('…');
    webViewRef.current.injectJavaScript(buildRegisterPushInjectJs(token, reason));
  }, []);

  const runPingRegisterApi = useCallback(() => {
    if (!webViewRef.current) {
      setPingReqSummary('—');
      setPingResSummary('—');
      setPingThrowSummary('no_webview_ref');
      return;
    }
    setPingReqSummary('…');
    setPingResSummary('…');
    setPingThrowSummary('…');
    webViewRef.current.injectJavaScript(buildPingRegisterInjectJs());
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

  /**
   * Foreground / background-open only — navigates WebView when user interacts with a notification.
   * Intentionally no getInitialNotification: cold launch always stays on keypad (see mount effect).
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
    let unsubFg: (() => void) | undefined;

    void (async () => {
      const messaging = (await import('@react-native-firebase/messaging')).default;
      if (cancelled) return;

      unsubOpen = messaging().onNotificationOpenedApp((remoteMessage) => {
        openFromMessage(remoteMessage);
      });

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
          const m = msg as Record<string, unknown>;
          if (step === 'register_meta') {
            setRegReqSummary(
              `url: ${String(m.url ?? '')}\nmethod: ${String(m.method ?? '')}\nredirect: ${String(m.redirect ?? '')}\ncredentials: ${String(m.credentials ?? '')}\npayload: ${String(m.payload ?? '')}`
            );
            setRegThrowSummary('—');
            console.warn('[SAINTLY-PUSH-REG] register_meta', msg);
          } else if (step === 'register_done') {
            const raw = typeof m.rawText === 'string' ? m.rawText : '';
            setRegResSummary(
              `status: ${String(m.status ?? '')}\nok: ${String(m.ok)}\nraw (text, not assumed JSON):\n${raw}`
            );
            console.warn('[SAINTLY-PUSH-REG] register_done', { status: m.status, ok: m.ok, len: raw.length });
          } else if (step === 'register_throw') {
            setRegThrowSummary(
              `name: ${String(m.name ?? '')}\nmessage: ${String(m.message ?? '')}\nstack:\n${String(m.stack ?? '')}`
            );
            setRegResSummary('—');
            console.warn('[SAINTLY-PUSH-REG] register_throw', msg);
          } else if (step === 'ping_meta') {
            setPingReqSummary(
              `url: ${String(m.url ?? '')}\nmethod: ${String(m.method ?? '')}\nredirect: ${String(m.redirect ?? '')}\ncredentials: ${String(m.credentials ?? '')}`
            );
            setPingThrowSummary('—');
            console.warn('[SAINTLY-PUSH-REG] ping_meta', msg);
          } else if (step === 'ping_done') {
            const raw = typeof m.rawText === 'string' ? m.rawText : '';
            setPingResSummary(
              `status: ${String(m.status ?? '')}\nok: ${String(m.ok)}\nraw (text):\n${raw}`
            );
            console.warn('[SAINTLY-PUSH-REG] ping_done', msg);
          } else if (step === 'ping_throw') {
            setPingThrowSummary(
              `name: ${String(m.name ?? '')}\nmessage: ${String(m.message ?? '')}\nstack:\n${String(m.stack ?? '')}`
            );
            setPingResSummary('—');
            console.warn('[SAINTLY-PUSH-REG] ping_throw', msg);
          } else if (step === 'postMessage_failed') {
            setRegThrowSummary(
              `postMessage failed: ${String((msg as { message?: string }).message ?? '')}`
            );
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

  const fcmTokenPreview =
    fcmToken && fcmToken.length > 0
      ? `${fcmToken.slice(0, 24)}… (len ${fcmToken.length})`
      : 'no';

  const apnsPreview =
    nativePushDetail?.apnsDeviceToken && nativePushDetail.apnsDeviceToken.length > 0
      ? `${nativePushDetail.apnsDeviceToken.slice(0, 20)}… (len ${nativePushDetail.apnsDeviceToken.length})`
      : 'no';

  const runNativePushRefresh = useCallback(async () => {
    setPushRefreshBusy(true);
    try {
      await refreshRegistration();
    } finally {
      setPushRefreshBusy(false);
    }
  }, [refreshRegistration]);

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
          onLoadEnd={() => {
            setLoading(false);
            setWebViewRefAttached(true);
          }}
          onNavigationStateChange={(navState) => {
            const url = navState.url ?? '';
            setCurrentWebViewUrl(url || '(empty)');
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

        <ScrollView style={styles.debugScroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.debugTitle}>TEMP push registration debug</Text>
          <Text style={styles.debugLine} selectable>
            apiBaseUrl: {env.apiBaseUrl}
          </Text>
          <Text style={styles.debugLine} selectable>
            pushRegisterUrl: {pushRegisterUrl()}
          </Text>
          <Text style={styles.debugLine} selectable>
            portalUri (state): {portalUri}
          </Text>
          <Text style={styles.debugLine} selectable>
            WebView URL (last nav): {currentWebViewUrl}
          </Text>
          <Text style={styles.debugLine} selectable>
            fcmToken: {fcmTokenPreview}
          </Text>
          <Text style={styles.debugLine} selectable>
            permission:{' '}
            {nativePushDetail
              ? `${nativePushDetail.permissionStatus ?? '—'} ${nativePushDetail.permissionLabel ?? ''}`
              : '…'}
          </Text>
          <Text style={styles.debugLine} selectable>
            APNs (Firebase): {apnsPreview}
          </Text>
          <Text style={styles.debugLine} selectable>
            native push error: {nativePushDetail?.errorText ?? '—'}
          </Text>
          <Text style={styles.debugLine} selectable>
            env: appOwnership={nativePushDetail?.diagnostics.appOwnership ?? '—'} exec=
            {nativePushDetail?.diagnostics.executionEnvironment ?? '—'}
          </Text>
          <Text style={styles.debugLine} selectable>
            webViewRef: {webViewRefAttached ? 'yes (onLoadEnd)' : 'not yet'}
          </Text>
          <Text style={styles.debugLine} selectable>
            last attempt: {lastRegAttemptReason}
          </Text>
          <Text style={styles.debugSectionLabel}>POST register (WebView)</Text>
          <Text style={styles.debugLine} selectable>
            {regReqSummary}
          </Text>
          <Text style={styles.debugSectionLabel}>register response</Text>
          <Text style={styles.debugLine} selectable>
            {regResSummary}
          </Text>
          <Text style={styles.debugSectionLabel}>register throw</Text>
          <Text style={styles.debugLine} selectable>
            {regThrowSummary}
          </Text>
          <Text style={styles.debugSectionLabel}>GET ping (WebView)</Text>
          <Text style={styles.debugLine} selectable>
            {pingReqSummary}
          </Text>
          <Text style={styles.debugSectionLabel}>ping response</Text>
          <Text style={styles.debugLine} selectable>
            {pingResSummary}
          </Text>
          <Text style={styles.debugSectionLabel}>ping throw</Text>
          <Text style={styles.debugLine} selectable>
            {pingThrowSummary}
          </Text>
          <View style={styles.debugRow}>
            <Pressable
              style={({ pressed }) => [
                styles.debugBtn,
                pressed && styles.debugBtnPressed,
                pushRefreshBusy && styles.debugBtnDisabled,
              ]}
              disabled={pushRefreshBusy}
              onPress={() => void runNativePushRefresh()}
            >
              <Text style={styles.debugBtnText}>
                {pushRefreshBusy ? 'Refreshing FCM…' : 'Request perm + refresh FCM'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.debugRow}>
            <Pressable
              style={({ pressed }) => [styles.debugBtn, pressed && styles.debugBtnPressed]}
              onPress={() => runPushRegistration('manual_debug_button')}
            >
              <Text style={styles.debugBtnText}>Run push registration now</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.debugBtn, pressed && styles.debugBtnPressed]}
              onPress={runPingRegisterApi}
            >
              <Text style={styles.debugBtnText}>Ping register API</Text>
            </Pressable>
          </View>
        </ScrollView>

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
    minHeight: 0,
  },
  debugScroll: {
    maxHeight: 360,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f97316',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  debugTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#c2410c',
    marginBottom: 6,
  },
  debugSectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9a3412',
    marginTop: 6,
    marginBottom: 2,
  },
  debugLine: {
    fontSize: 9,
    lineHeight: 12,
    color: '#1e293b',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  debugRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  debugBtn: {
    backgroundColor: '#ea580c',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  debugBtnPressed: {
    opacity: 0.88,
  },
  debugBtnDisabled: {
    opacity: 0.55,
  },
  debugBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
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
