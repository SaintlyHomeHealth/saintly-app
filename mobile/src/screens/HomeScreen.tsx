import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { env } from '../config/env';
import { useNativePushRegistration } from '../hooks/useNativePushRegistration';
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
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          allowsBackForwardNavigationGestures
        />
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}
        <View style={styles.pushBar} pointerEvents="none">
          {pushEnv ? (
            <Text style={styles.pushText}>{pushStatusLine(pushEnv)}</Text>
          ) : (
            <Text style={styles.pushText}>Preparing call environment…</Text>
          )}
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
  pushBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
});
