import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { contentDispositionAttachment, faxPdfFilename } from "@/lib/fax/fax-ehr-filing";
import { loadFaxDocumentBytes } from "@/lib/fax/load-fax-document-bytes";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ faxId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { faxId } = await context.params;
  const id = faxId?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing fax." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("fax_messages")
    .select("id, display_title, note, storage_path, media_url")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.id) {
    return NextResponse.json({ error: "Fax not found." }, { status: 404 });
  }

  const bytes = await loadFaxDocumentBytes({
    storagePath: typeof data.storage_path === "string" ? data.storage_path : null,
    mediaUrl: typeof data.media_url === "string" ? data.media_url : null,
  });
  if (!bytes) {
    return NextResponse.json({ error: "No PDF available for this fax." }, { status: 404 });
  }

  const filename = faxPdfFilename({
    displayTitle: typeof data.display_title === "string" ? data.display_title : null,
    note: typeof data.note === "string" ? data.note : null,
    faxId: data.id as string,
  });

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionAttachment(filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
