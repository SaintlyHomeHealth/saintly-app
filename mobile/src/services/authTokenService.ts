import { softphoneTokenUrl } from '../config/env';

/**
 * Response shape from GET https://appsaintlyhomehealth.com/api/softphone/token
 * (matches `src/app/api/softphone/token/route.ts` in the web app).
 */
export type SoftphoneTokenResponse = {
  token: string;
  identity: string;
  staff_user_id?: string;
  inbound_ring_staff_user_ids?: string[];
  identity_in_inbound_ring_list?: boolean;
  expiresInSeconds?: number;
  error?: string;
};

export type FetchSoftphoneTokenOptions = {
  /** Abort long-running token fetch (e.g. screen unmount). */
  signal?: AbortSignal;
  /**
   * Supabase user JWT (`session.access_token`) — server accepts `Authorization: Bearer` on
   * `GET /api/softphone/token` (see `getStaffProfileUsingSupabaseUserJwt`).
   */
  getAccessToken?: () => Promise<string | null>;
  /**
   * Send cookies (iOS: may share WKWebView cookie store when `sharedCookiesEnabled` on WebView).
   * Fallback when no bearer is stored; often insufficient for RN vs WebView — prefer bearer.
   */
  credentialsInclude?: boolean;
};

/** Fetches a Twilio Voice access JWT from the Saintly backend (`GET /api/softphone/token`). */
export async function fetchSoftphoneAccessToken(
  options: FetchSoftphoneTokenOptions = {}
): Promise<SoftphoneTokenResponse> {
  const url = softphoneTokenUrl();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const bearer = options.getAccessToken ? await options.getAccessToken() : null;
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  const credentials: RequestCredentials =
    bearer || !options.credentialsInclude ? 'omit' : 'include';

  const authMode: 'bearer' | 'cookie' | 'omit' = bearer
    ? 'bearer'
    : options.credentialsInclude
      ? 'cookie'
      : 'omit';

  console.warn('[SAINTLY-TRACE] /api/softphone/token request start', { authMode });
  console.warn('[SAINTLY-NATIVE-AUTH] softphone_token_request_start', {
    authMode,
    url,
    bearerLen: bearer?.length ?? 0,
  });

  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: options.signal,
    credentials,
  });

  console.warn('[SAINTLY-TRACE] /api/softphone/token response', { status: res.status, ok: res.ok });

  const body = (await res.json().catch(() => ({}))) as SoftphoneTokenResponse;

  console.warn('[SAINTLY-NATIVE-AUTH] softphone_token_response', {
    authMode,
    status: res.status,
    ok: res.ok,
    hasTwilioJwt: typeof body.token === 'string' && body.token.length > 0,
  });

  if (!res.ok) {
    return {
      token: '',
      identity: '',
      error: body.error ?? `Token request failed (${res.status})`,
    };
  }

  if (typeof body.token !== 'string' || !body.token) {
    return {
      token: '',
      identity: '',
      error: body.error ?? 'Invalid token response',
    };
  }

  return body;
}
