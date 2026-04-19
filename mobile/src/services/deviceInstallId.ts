import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@saintly/device_install_id_v1';

function newInstallUuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Stable per app install (survives restarts, cleared on uninstall).
 * Used server-side as the dedupe key for SMS FCM (`user_push_devices`: one row per install).
 */
export async function getOrCreateDeviceInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  const trimmed = typeof existing === 'string' ? existing.trim() : '';
  if (trimmed) {
    return trimmed;
  }
  const id = newInstallUuidV4();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}
