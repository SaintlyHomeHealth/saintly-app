import { NextResponse } from "next/server";

import {
  fetchRecipientCompletedPdfBytes,
  loadRecipientContextByTokenHash,
  renderRecipientSigningPreviewPdf,
} from "@/lib/pdf-sign/complete-recipient-signing";
import { hashSignToken } from "@/lib/pdf-sign/token";

function asciiFilename(raw: string | null | undefined): string {
  const s = (raw ?? "document").trim() || "document";
  const cleaned = s.replace(/[^\w\-.]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 96) || "document";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token: tok } = await context.params;
  const rawToken = decodeURIComponent(tok ?? "").trim();
  if (!rawToken) return new NextResponse("Missing token.", { status: 400 });

  const url = new URL(request.url);
  const completed = url.searchParams.get("completed") === "1";
  const download = url.searchParams.get("download") === "1";

  const loaded = await loadRecipientContextByTokenHash(hashSignToken(rawToken));
  if (!loaded) return new NextResponse("Invalid or expired link.", { status: 404 });

  const { recipient, packet, template } = loaded;

  if (packet.voided_at) return new NextResponse("This packet was voided.", { status: 410 });
  if (new Date(recipient.token_expires_at).getTime() < Date.now()) {
    return new NextResponse("This link has expired.", { status: 410 });
  }

  let pdfBytes: Uint8Array;
  if (completed) {
    if (!recipient.signed_at) {
      return new NextResponse("Document has not been signed yet.", { status: 409 });
    }
    const r = await fetchRecipientCompletedPdfBytes(loaded);
    if ("error" in r) return new NextResponse(r.error, { status: r.status });
    pdfBytes = r.pdfBytes;
  } else {
    const r = await renderRecipientSigningPreviewPdf(loaded);
    if ("error" in r) return new NextResponse(r.error, { status: r.status });
    pdfBytes = r.pdfBytes;
  }

  const slug = asciiFilename(template.name ?? undefined);
  const filename = `${completed ? "signed_" : ""}${slug}.pdf`;
  const dispType = download ? "attachment" : "inline";

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dispType}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
