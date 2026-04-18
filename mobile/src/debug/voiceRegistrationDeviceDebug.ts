/**
 * TEMP: ring-buffer log for on-device HomeScreen voice registration panel.
 * Remove: delete this file, VoiceRegistrationDeviceDebugPanel.tsx, imports, and JSX in HomeScreen.
 */

import { Platform } from 'react-native';

const MAX_LINES = 20;

export type VoiceRegistrationDeviceLogEntry = {
  id: number;
  time: string;
  label: string;
};

let entries: VoiceRegistrationDeviceLogEntry[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function formatTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** Newest-first ring buffer; label must not contain raw tokens or secrets. */
export function voiceRegistrationDeviceLog(label: string): void {
  if (Platform.OS !== 'ios') return;
  entries = [{ id: nextId++, time: formatTime(), label }, ...entries].slice(0, MAX_LINES);
  listeners.forEach((l) => l());
}

export function subscribeVoiceRegistrationDeviceLog(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function getVoiceRegistrationDeviceLogSnapshot(): readonly VoiceRegistrationDeviceLogEntry[] {
  return entries;
}
