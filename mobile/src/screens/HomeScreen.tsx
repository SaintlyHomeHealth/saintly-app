import { useCallback, useState } from 'react';
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
import { WebView } from 'react-native-webview';

import { env } from '../config/env';
import { useNativePushRegistration } from '../hooks/useNativePushRegistration';
import { requestForegroundLocationWhenNeeded } from '../services/locationPermission';
import { colors } from '../theme/colors';

import type { HomeScreenProps } from '../navigation/types';

/** Workspace phone keypad; base from `env` (see `app.config.ts` / `EXPO_PUBLIC_API_BASE_URL`). */
function portalUrl(): string {
  const base = env.apiBaseUrl.replace(/\/$/, '') || 'https://appsaintlyhomehealth.com';
  return `${base}/workspace/phone/keypad`;
}

function pushStatusLine(environment: string): string {
  switch (environment) {
    case 'expo_go':
      return 'Running in Expo Go — native VoIP push registers in a development build.';
    case 'development_build':
      return 'Development build — wire APNs / FCM in native push service when ready.';
    case 'standalone':
      return 'Production build — native push hooks apply here.';
    default:
      return 'Push environment unknown — verify execution context.';
  }
}

export function HomeScreen(_props: HomeScreenProps) {
  const pushState = useNativePushRegistration();
  const pushEnv =
    pushState.status === 'ready' ? pushState.result.environment : null;
  const [loading, setLoading] = useState(true);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  const onWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const raw = event.nativeEvent.data;
      const msg = JSON.parse(raw) as { type?: string };
      if (msg.type === 'open-settings') {
        void Linking.openSettings();
      }
    } catch {
      // ignore non-JSON messages
    }
  }, []);

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
          source={{ uri: portalUrl() }}
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
            <Text style={styles.pushText}>{pushStatusLine(pushEnv)}</Text>
          ) : (
            <Text style={styles.pushText}>Preparing call environment…</Text>
          )}
          {Platform.OS === 'ios' ? (
            <Text style={styles.pushTextMuted}>
              Microphone access is requested when you place or answer a call in the keypad.
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
