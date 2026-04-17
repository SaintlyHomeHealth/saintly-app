import Constants from 'expo-constants';

type Extra = {
  apiBaseUrl?: string;
  twilioLogLevel?: string;
};

function readExtra(): Extra {
  const extra = Constants.expoConfig?.extra as Extra | undefined;
  return extra ?? {};
}

/** Production portal + API origin (WebView + cookie-authenticated fetches must match this host). */
export const DEFAULT_PRODUCTION_API_ORIGIN = 'https://www.appsaintlyhomehealth.com';

/**
 * Single origin for WebView + push registration + softphone token in release builds.
 *
 * Release/TestFlight (`__DEV__ === false`): always `DEFAULT_PRODUCTION_API_ORIGIN` unless
 * `EXPO_PUBLIC_APP_ORIGIN` is set (staging). This avoids a bad EAS `EXPO_PUBLIC_API_BASE_URL`
 * baking localhost into the app while cookies only exist on production.
 *
 * Development: `app.config` extra, then `EXPO_PUBLIC_API_BASE_URL`, then default.
 */
function resolveApiBaseUrl(): string {
  const stagingOrOverride = process.env.EXPO_PUBLIC_APP_ORIGIN?.trim();
  if (stagingOrOverride) {
    return stagingOrOverride.replace(/\/$/, '');
  }
  if (__DEV__) {
    return (
      readExtra().apiBaseUrl ??
      process.env.EXPO_PUBLIC_API_BASE_URL ??
      DEFAULT_PRODUCTION_API_ORIGIN
    ).replace(/\/$/, '');
  }
  return DEFAULT_PRODUCTION_API_ORIGIN;
}

const resolvedApiBaseUrl = resolveApiBaseUrl();

/**
 * Runtime config (see `app.config.ts` `extra` + `EXPO_PUBLIC_*` env at build time).
 * Do not put secrets here — only public URLs and non-sensitive flags.
 */
export const env = {
  /** API origin (no trailing slash). WebView + API calls use this. */
  apiBaseUrl: resolvedApiBaseUrl,

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

/** Cookie-authenticated FCM device registration (POST from WebView `injectJavaScript`). */
export function pushRegisterUrl(): string {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  return `${base}/api/workspace/mobile/push/register`;
}

/** Twilio Voice device registry (POST) — separate from SMS `user_push_devices` / `devices` FCM for alerts. */
export function voiceRegisterUrl(): string {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  return `${base}/api/workspace/mobile/voice/register`;
}

/** Resolved at module load — log in HomeScreen to verify production. */
export const PUSH_REGISTER_URL_RESOLVED = pushRegisterUrl();

/** One-line diagnostics for Xcode / device console (search: SAINTLY-PUSH-REG). */
export function logPushRegistrationEnvDiagnostics(): void {
  console.warn("[SAINTLY-PUSH-REG] env_snapshot", {
    __DEV__,
    hasExpoAppOrigin: Boolean(process.env.EXPO_PUBLIC_APP_ORIGIN?.trim()),
    apiBaseUrl: env.apiBaseUrl,
    pushRegisterUrl: PUSH_REGISTER_URL_RESOLVED,
    expectedProductionRegisterUrl: `${DEFAULT_PRODUCTION_API_ORIGIN}/api/workspace/mobile/push/register`,
  });
}
