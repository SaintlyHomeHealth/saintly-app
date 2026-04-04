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
   * TODO: Pass Supabase session JWT or session cookie transport once mobile auth is wired.
   * Web uses HTTP-only cookies; RN typically uses `Authorization: Bearer <access_token>`.
   */
  getAccessToken?: () => Promise<string | null>;
};

/**
 * Fetches a Twilio Voice access JWT from the existing Saintly backend.
 *
 * TODO: Replace `getAccessToken` wiring with your Supabase `session.access_token` (or equivalent).
 * TODO: Handle 401 by refreshing session and retrying once.
 */
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

  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: options.signal,
  });

  const body = (await res.json().catch(() => ({}))) as SoftphoneTokenResponse;

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
