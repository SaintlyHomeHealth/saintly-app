import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { FAX_DOCUMENTS_BUCKET } from "@/lib/fax/fax-service";

/** Bytes for a stored fax PDF, or the original media URL when storage is empty. */
export async function loadFaxDocumentBytes(input: {
  storagePath: string | null;
  mediaUrl: string | null;
}): Promise<Uint8Array | null> {
  const srcPath = typeof input.storagePath === "string" && input.storagePath.trim() ? input.storagePath.trim() : null;
  if (srcPath) {
    const { data, error } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).download(srcPath);
    if (!error && data) {
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (bytes.byteLength > 0) return bytes;
    }
  }

  const media = typeof input.mediaUrl === "string" ? input.mediaUrl.trim() : "";
  if (!media.startsWith("https://")) return null;

  try {
    const res = await fetch(media, { cache: "no-store" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}
