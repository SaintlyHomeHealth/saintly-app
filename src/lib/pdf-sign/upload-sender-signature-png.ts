import "server-only";

import { PDF_SIGN_BUCKETS } from "@/lib/pdf-sign/constants";
import { supabaseAdmin } from "@/lib/admin";

export async function uploadPdfSignSenderSignaturePng(input: {
  packetId: string;
  fieldKey: string;
  dataUrl: string;
}): Promise<{ bucket: string; path: string } | null> {
  const m = /^data:image\/png;base64,(.+)$/i.exec(input.dataUrl.trim());
  if (!m || !m[1]) return null;
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length === 0 || bytes.length > 600_000) return null;
  const path = `packets/${input.packetId}/sender/${input.fieldKey}-${Date.now()}.png`;
  const { error } = await supabaseAdmin.storage
    .from(PDF_SIGN_BUCKETS.images)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) return null;
  return { bucket: PDF_SIGN_BUCKETS.images, path };
}
