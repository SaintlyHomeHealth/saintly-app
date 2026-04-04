import Constants from 'expo-constants';

type Extra = {
  apiBaseUrl?: string;
  twilioLogLevel?: string;
};

function readExtra(): Extra {
  const extra = Constants.expoConfig?.extra as Extra | undefined;
  return extra ?? {};
}

/**
 * Runtime config (see `app.config.ts` `extra` + `EXPO_PUBLIC_*` env at build time).
 * Do not put secrets here — only public URLs and non-sensitive flags.
 */
export const env = {
  /** API origin (no trailing slash). Default matches production portal. */
  apiBaseUrl: readExtra().apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://appsaintlyhomehealth.com',

  /** Path appended to `apiBaseUrl` for Twilio Voice access token (same contract as web). */
  softphoneTokenPath: '/api/softphone/token',

  /** TODO: Twilio RN SDK log level when native module is linked. */
  twilioLogLevel: readExtra().twilioLogLevel ?? process.env.EXPO_PUBLIC_TWILIO_LOG_LEVEL ?? 'error',
} as const;

export function softphoneTokenUrl(): string {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  const path = env.softphoneTokenPath.startsWith('/') ? env.softphoneTokenPath : `/${env.softphoneTokenPath}`;
  return `${base}${path}`;
}
