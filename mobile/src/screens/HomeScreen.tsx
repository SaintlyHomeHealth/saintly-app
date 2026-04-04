import { StyleSheet, Text, View } from 'react-native';

import { SaintlyCard, ScreenContainer } from '../components';
import { useNativePushRegistration } from '../hooks/useNativePushRegistration';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

import type { HomeScreenProps } from '../navigation/types';

function pushStatusLine(env: string): string {
  switch (env) {
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
  const env =
    pushState.status === 'ready' ? pushState.result.environment : null;

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Saintly Home Health</Text>
        <SaintlyCard>
          <View style={styles.ring} />
          <Text style={styles.title}>Saintly Phone - Ready for Calls</Text>
          <Text style={styles.subtitle}>
            Voice and call signaling will connect here. Twilio Voice and native
            push are stubbed until the development build is wired.
          </Text>
          {env ? (
            <Text style={styles.hintNeutral}>{pushStatusLine(env)}</Text>
          ) : (
            <Text style={styles.hintNeutral}>Preparing call environment…</Text>
          )}
        </SaintlyCard>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 32,
  },
  kicker: {
    ...typography.label,
    color: colors.primary,
    marginBottom: 16,
    marginLeft: 4,
  },
  ring: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryMuted,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: colors.ring,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  hintNeutral: {
    marginTop: 16,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
