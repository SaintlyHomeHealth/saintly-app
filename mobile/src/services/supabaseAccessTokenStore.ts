import * as SecureStore from 'expo-secure-store';

const KEY = 'saintly_supabase_access_token';

export async function getStoredSupabaseAccessToken(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function setStoredSupabaseAccessToken(token: string | null): Promise<void> {
  try {
    if (!token || !token.trim()) {
      await SecureStore.deleteItemAsync(KEY);
      return;
    }
    await SecureStore.setItemAsync(KEY, token.trim());
  } catch {
    // ignore
  }
}
