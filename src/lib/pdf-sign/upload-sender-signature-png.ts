import "server-only";

import { PDF_SIGN_BUCKETS } from "@/lib/pdf-sign/constants";
import { supabaseAdmin } from "@/lib/admin";

export function decodeSignPngDataUrl(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim());
  if (!m || !m[1]) return null;
  try {
    const bytes = Buffer.from(m[1], "base64");
    if (bytes.length === 0 || bytes.length > 600_000) return null;
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

export async function uploadPdfSignSenderSignaturePng(input: {
  packetId: string;
  fieldKey: string;
  dataUrl: string;
}): Promise<{ bucket: string; path: string } | null> {
  const bytes = decodeSignPngDataUrl(input.dataUrl);
  if (!bytes) return null;
  const path = `packets/${input.packetId}/sender/${input.fieldKey}-${Date.now()}.png`;
  const { error } = await supabaseAdmin.storage
    .from(PDF_SIGN_BUCKETS.images)
    .upload(path, Buffer.from(bytes), { contentType: "image/png", upsert: true });
  if (error) return null;
  return { bucket: PDF_SIGN_BUCKETS.images, path };
}

export async function uploadPdfSignRecipientSignaturePng(input: {
  packetId: string;
  recipientId: string;
  fieldKey: string;
  dataUrl: string;
}): Promise<{ bucket: string; path: string } | null> {
  const bytes = decodeSignPngDataUrl(input.dataUrl);
  if (!bytes) return null;
  const path = `packets/${input.packetId}/recipient/${input.recipientId}/${input.fieldKey}-${Date.now()}.png`;
  const { error } = await supabaseAdmin.storage
    .from(PDF_SIGN_BUCKETS.images)
    .upload(path, Buffer.from(bytes), { contentType: "image/png", upsert: false });
  if (error) return null;
  return { bucket: PDF_SIGN_BUCKETS.images, path };
}
