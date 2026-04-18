import * as SecureStore from 'expo-secure-store';

const KEY = 'saintly_supabase_access_token';

export async function getStoredSupabaseAccessToken(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    const out = typeof v === 'string' && v.trim() ? v.trim() : null;
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
      console.warn('[SAINTLY-NATIVE-AUTH] secure_store_cleared');
      return;
    }
    const trimmed = token.trim();
    await SecureStore.setItemAsync(KEY, trimmed);
    console.warn('[SAINTLY-NATIVE-AUTH] secure_store_written', { tokenLen: trimmed.length });
  } catch (e) {
    console.warn('[SAINTLY-NATIVE-AUTH] secure_store_write_error', e);
  }
}
