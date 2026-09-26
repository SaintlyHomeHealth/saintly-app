/** Stay under typical host request limits (about 4.5 MB) with room for multipart overhead. */
const DIRECT_UPLOAD_MAX_BYTES = 3_500_000;
const TARGET_JPEG_BYTES = 800_000;
const MAX_EDGE_PX = 1600;

export type PreparedOrderPhoto =
  | { ok: true; file: File }
  | { ok: false; message: string };

function isPdf(file: File): boolean {
  const mime = (file.type || "").toLowerCase().split(";")[0]?.trim() ?? "";
  return mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function jpegName(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "card"}.jpg`;
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("decode");
  }
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function resizeImageFileToJpeg(file: File, label: string): Promise<File> {
  const bitmap = await decodeImage(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest) throw new Error("empty-image");
    const scale = Math.min(1, MAX_EDGE_PX / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.82;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      blob = await canvasToJpeg(canvas, quality);
      if (blob && blob.size <= TARGET_JPEG_BYTES) break;
      quality = Math.max(0.4, quality - 0.12);
    }
    if (!blob || blob.size < 1 || blob.size > DIRECT_UPLOAD_MAX_BYTES) {
      throw new Error("encode");
    }
    return new File([blob], jpegName(label), { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}

/**
 * Shrink a phone photo to a JPEG before upload. PDFs pass through when they are already small.
 */
export async function prepareOrderPhoto(file: File, label: string): Promise<PreparedOrderPhoto> {
  if (file.size < 1) {
    return { ok: false, message: `${label} is empty. Choose the photo again.` };
  }

  if (isPdf(file)) {
    if (file.size > DIRECT_UPLOAD_MAX_BYTES) {
      return { ok: false, message: `${label} PDF is too large. Use a photo instead.` };
    }
    return { ok: true, file };
  }

  try {
    return { ok: true, file: await resizeImageFileToJpeg(file, label) };
  } catch {
    const mime = (file.type || "").toLowerCase().split(";")[0]?.trim() ?? "";
    const browserImage =
      mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" || mime === "image/jpg";
    if (browserImage && file.size <= DIRECT_UPLOAD_MAX_BYTES) {
      if (mime === "image/jpg") {
        return {
          ok: true,
          file: new File([file], file.name || "card.jpg", { type: "image/jpeg" }),
        };
      }
      return { ok: true, file };
    }
    return {
      ok: false,
      message: `${label} couldn't be read. Choose a JPEG or PNG, or take a new photo.`,
    };
  }
}
