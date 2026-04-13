import * as Location from 'expo-location';

export type LocationPermissionResult = {
  granted: boolean;
  /** When denied — short copy for UI */
  deniedMessage?: string;
};

/**
 * Request foreground location only when you call this (not on app launch).
 * Use for future visit / call–location workflows.
 */
export async function requestForegroundLocationWhenNeeded(): Promise<LocationPermissionResult> {
  const existing = await Location.getForegroundPermissionsAsync();
  if (existing.status === Location.PermissionStatus.GRANTED) {
    return { granted: true };
  }
  const asked = await Location.requestForegroundPermissionsAsync();
  if (asked.status === Location.PermissionStatus.GRANTED) {
    return { granted: true };
  }
  return {
    granted: false,
    deniedMessage:
      'Location is turned off for Saintly Home Health. You can enable it in Settings when you need location for visits or call workflows.',
  };
}
