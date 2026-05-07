import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { FAX_DOCUMENTS_BUCKET, signedFaxPdfUrl } from "@/lib/fax/fax-service";

export const TELNYX_FAX_ENDPOINT = "https://api.telnyx.com/v2/faxes";

export class TelnyxFaxError extends Error {
  responseStatus: number;
  code: string | null;
  telnyxMessage: string;

  constructor(input: { responseStatus: number; code: string | null; message: string }) {
    super(input.message);
    this.name = "TelnyxFaxError";
    this.responseStatus = input.responseStatus;
    this.code = input.code;
    this.telnyxMessage = input.message;
  }
}

function requireHttpsMediaUrl(mediaUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    throw new Error("Fax PDF URL must be a valid public HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Fax PDF URL must use HTTPS so Telnyx can retrieve it.");
  }
}

export async function assertMediaUrlAccessible(mediaUrl: string) {
  requireHttpsMediaUrl(mediaUrl);

  const check = async (method: "HEAD" | "GET") => {
    const res = await fetch(mediaUrl, {
      method,
      cache: "no-store",
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    });
    await res.body?.cancel();
    return res;
  };

  let res = await check("HEAD").catch(() => null);
  if (!res || res.status === 405) {
    res = await check("GET").catch(() => null);
  }

  if (!res) {
    throw new Error("Fax PDF URL could not be checked before sending to Telnyx.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("Fax PDF URL is not publicly accessible to Telnyx. Use a signed URL for private storage.");
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`Fax PDF URL is not accessible to Telnyx (${res.status}).`);
  }
}

export type OutboundSendMediaInput = {
  file: File | null;
  storage_path: string | null;
  media_url: string | null;
};

export async function resolveOutboundSendMedia(
  input: OutboundSendMediaInput,
  faxMessageId: string
): Promise<{ mediaUrl: string; storagePath: string | null }> {
  if (input.file) {
    const storagePath = `outbound/${new Date().toISOString().slice(0, 10)}/${faxMessageId}.pdf`;
    const { error } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).upload(storagePath, await input.file.arrayBuffer(), {
      contentType: input.file.type || "application/pdf",
      upsert: true,
    });
    if (error) throw new Error("Could not store fax PDF before sending.");
    const mediaUrl = await signedFaxPdfUrl(storagePath);
    if (!mediaUrl) throw new Error("Could not create a secure PDF link for Telnyx.");
    await assertMediaUrlAccessible(mediaUrl);
    return { mediaUrl, storagePath };
  }
  if (input.storage_path) {
    const mediaUrl = await signedFaxPdfUrl(input.storage_path);
    if (!mediaUrl) throw new Error("Could not create a secure PDF link for Telnyx.");
    await assertMediaUrlAccessible(mediaUrl);
    return { mediaUrl, storagePath: input.storage_path };
  }
  if (input.media_url) {
    await assertMediaUrlAccessible(input.media_url);
    return { mediaUrl: input.media_url, storagePath: null };
  }
  throw new Error("Attach a PDF or provide an existing PDF URL.");
}

function telnyxApiKey(): string {
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) throw new Error("Telnyx API key is not configured.");
  return key;
}

export function telnyxFaxConnectionId(): string {
  const connectionId = process.env.TELNYX_FAX_CONNECTION_ID?.trim();
  if (!connectionId) throw new Error("TELNYX_FAX_CONNECTION_ID is not configured.");
  return connectionId;
}

export async function callTelnyxSendFax(input: { to: string; from: string; mediaUrl: string; connectionId: string }) {
  const res = await fetch(TELNYX_FAX_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${telnyxApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.to,
      from: input.from,
      media_url: input.mediaUrl,
      connection_id: input.connectionId,
      webhook_url: "https://www.appsaintlyhomehealth.com/api/fax/status",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errors = Array.isArray(body.errors) ? body.errors : [];
    const firstError = errors.find((err) => err && typeof err === "object") as Record<string, unknown> | undefined;
    const code = typeof firstError?.code === "string" ? firstError.code : null;
    const message =
      errors
        .map((err) => {
          if (!err || typeof err !== "object") return null;
          const record = err as Record<string, unknown>;
          return typeof record.detail === "string"
            ? record.detail
            : typeof record.title === "string"
              ? record.title
              : null;
        })
        .filter((detail): detail is string => typeof detail === "string" && detail.trim().length > 0)
        .join("; ") || `Telnyx rejected the fax (${res.status}).`;
    throw new TelnyxFaxError({ responseStatus: res.status, code, message });
  }
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : body;
  return {
    telnyxFaxId: typeof data.id === "string" ? data.id : null,
    status: typeof data.status === "string" ? data.status : "queued",
    responseStatus: res.status,
  };
}
