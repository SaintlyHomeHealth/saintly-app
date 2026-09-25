import JSZip from "jszip";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  contentDispositionAttachment,
  faxPdfFilename,
  parseFaxIds,
  uniqueFaxPdfZipName,
} from "@/lib/fax/fax-ehr-filing";
import { loadFaxDocumentBytes } from "@/lib/fax/load-fax-document-bytes";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type FaxDownloadRow = {
  id: string;
  display_title: string | null;
  note: string | null;
  storage_path: string | null;
  media_url: string | null;
};

export async function POST(request: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ids = parseFaxIds(body && typeof body === "object" ? (body as { faxIds?: unknown }).faxIds : null);
  if (ids.length === 0) {
    return NextResponse.json({ error: "No faxes selected." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("fax_messages")
    .select("id, display_title, note, storage_path, media_url")
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message || "Could not load the selected faxes." }, { status: 500 });
  }

  const byId = new Map(((data ?? []) as FaxDownloadRow[]).map((row) => [row.id, row]));
  const zip = new JSZip();
  const usedNames = new Set<string>();
  let added = 0;

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const bytes = await loadFaxDocumentBytes({
      storagePath: row.storage_path,
      mediaUrl: row.media_url,
    });
    if (!bytes) continue;
    const filename = uniqueFaxPdfZipName(
      usedNames,
      faxPdfFilename({
        displayTitle: row.display_title,
        note: row.note,
        faxId: row.id,
      })
    );
    zip.file(filename, bytes);
    added += 1;
  }

  if (added === 0) {
    return NextResponse.json({ error: "None of the selected faxes have a PDF to download." }, { status: 404 });
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  return new NextResponse(zipBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDispositionAttachment("unfiled-faxes.zip"),
      "Cache-Control": "private, no-store",
    },
  });
}
