/**
 * Download MMS media binary from Twilio’s API URL via HTTP Basic Auth.
 * Twilio rejects unauthenticated fetches quickly; never expose this URL publicly.
 */
export async function fetchTwilioMediaAuthorized(
  mediaUrlAbsolute: string,
  options?: { signal?: AbortSignal }
): Promise<
  | { ok: true; bytes: Uint8Array; contentType: string | null }
  | { ok: false; error: string; status?: number }
> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    return { ok: false, error: "missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN" };
  }
  try {
    const res = await fetch(mediaUrlAbsolute, {
      redirect: "follow",
      signal: options?.signal,
      headers: {
        Authorization:
          `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      },
    });
    const ctRaw = typeof res.headers.get("content-type") === "string" ? res.headers.get("content-type") : null;
    const contentType =
      ctRaw && ctRaw.toLowerCase().includes("application/json")
        ? null
        : ctRaw?.split(";")[0]?.trim() ?? null;
    const status = res.status;
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const snip = (t ?? "").slice(0, 200);
      return { ok: false, error: snip ? `Twilio HTTP ${status}: ${snip}` : `Twilio HTTP ${status}`, status };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { ok: true, bytes: buf, contentType };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type TwilioMessageMediaRestItem = {
  sid?: string;
  uri?: string;
};

export type TwilioMessageMediaRestPage = {
  media_list?: TwilioMessageMediaRestItem[];
};

/** List MMS media URIs via Twilio REST (backfill path when webhook lacked NumMedia rows). */
export async function fetchTwilioMessageMediaUriListViaRest(
  messageSid: string
): Promise<
  | { ok: true; mediaUrlsAbsolute: string[] }
  | { ok: false; error: string }
> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    return { ok: false, error: "missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN" };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages/${encodeURIComponent(messageSid)}/Media.json`;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      },
    });
    const j = (await res.json().catch(() => null)) as TwilioMessageMediaRestPage | null;
    if (!res.ok) {
      return { ok: false, error: `Twilio list media HTTP ${res.status}` };
    }
    const record = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
    const rawList =
      Array.isArray(record.media_list)
        ? (record.media_list as TwilioMessageMediaRestItem[])
        : Array.isArray(record.contents)
          ? (record.contents as TwilioMessageMediaRestItem[])
          : [];
    const list = rawList ?? [];
    const out: string[] = [];
    for (const row of list) {
      const u = typeof row.uri === "string" ? row.uri.trim() : "";
      if (!u) continue;
      const trimmed = u.replace(/\.json(\?.*)?$/i, "");
      const absolute = trimmed.startsWith("http")
        ? trimmed
        : `https://api.twilio.com${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
      out.push(absolute);
    }
    return { ok: true, mediaUrlsAbsolute: out };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
