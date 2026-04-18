import * as SecureStore from 'expo-secure-store';

import { voiceRegistrationDeviceLog } from '../debug/voiceRegistrationDeviceDebug';

const KEY = 'saintly_supabase_access_token';

export async function getStoredSupabaseAccessToken(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    const out = typeof v === 'string' && v.trim() ? v.trim() : null;
    console.warn('[SAINTLY-TRACE] reading token from SecureStore', {
      hasToken: Boolean(out),
      tokenLength: out?.length ?? 0,
    });
    voiceRegistrationDeviceLog(
      `reading token from SecureStore hasToken=${Boolean(out)}`
    );
    console.warn('[SAINTLY-NATIVE-AUTH] secure_store_read', {
      hasToken: Boolean(out),
      tokenLen: out?.length ?? 0,
    });
    return out;
  } catch (e) {
    console.warn('[SAINTLY-NATIVE-AUTH] secure_store_read_error', e);
    return null;
  }
}

export async function setStoredSupabaseAccessToken(token: string | null): Promise<void> {
  try {
    if (!token || !token.trim()) {
      await SecureStore.deleteItemAsync(KEY);
      console.warn('[SAINTLY-TRACE] clearing token from SecureStore', {
        hasToken: false,
        tokenLength: 0,
      });
      voiceRegistrationDeviceLog('writing token to SecureStore (cleared)');
      console.warn('[SAINTLY-NATIVE-AUTH] secure_store_cleared');
      return;
    }
    const trimmed = token.trim();
    await SecureStore.setItemAsync(KEY, trimmed);
    console.warn('[SAINTLY-TRACE] writing token to SecureStore', {
      hasToken: true,
      tokenLength: trimmed.length,
    });
    voiceRegistrationDeviceLog(`writing token to SecureStore len=${trimmed.length}`);
    console.warn('[SAINTLY-NATIVE-AUTH] secure_store_written', { tokenLen: trimmed.length });
  } catch (e) {
    console.warn('[SAINTLY-NATIVE-AUTH] secure_store_write_error', e);
  }
}
