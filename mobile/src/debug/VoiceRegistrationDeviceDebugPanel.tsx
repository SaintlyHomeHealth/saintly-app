/**
 * TEMP on-screen voice registration trace — HomeScreen only. Remove with voiceRegistrationDeviceDebug.ts.
 */

import { useSyncExternalStore } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getVoiceRegistrationDeviceLogSnapshot,
  subscribeVoiceRegistrationDeviceLog,
} from './voiceRegistrationDeviceDebug';

export function VoiceRegistrationDeviceDebugPanel() {
  const lines = useSyncExternalStore(
    subscribeVoiceRegistrationDeviceLog,
    () => getVoiceRegistrationDeviceLogSnapshot(),
    () => getVoiceRegistrationDeviceLogSnapshot()
  );

  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Text style={styles.title}>Voice reg (TEMP — remove)</Text>
      <ScrollView
        style={styles.scroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {lines.map((e) => (
          <Text key={e.id} style={styles.line} selectable numberOfLines={3}>
            {e.time} · {e.label}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    maxHeight: 120,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#0ea5e9',
    backgroundColor: 'rgba(224, 242, 254, 0.97)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  title: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 4,
  },
  scroll: {
    maxHeight: 92,
  },
  line: {
    fontSize: 8,
    lineHeight: 11,
    color: '#0c4a6e',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
});
