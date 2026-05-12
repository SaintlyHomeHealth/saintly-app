import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

function safeDownloadFilename(base: string): string {
  const s = base.replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
  return (s || "document") + ".pdf";
}

/**
 * Streams the stored template PDF for admin preview (iframe / embed).
 * Not for public/token access — packet does not need to exist.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await context.params;
  if (!templateId) {
    return NextResponse.json({ error: "Missing template id." }, { status: 400 });
  }

  const { data: tpl, error: tErr } = await supabaseAdmin
    .from("signature_templates")
    .select("id, name, storage_bucket, storage_object_path")
    .eq("id", templateId)
    .maybeSingle();

  if (tErr || !tpl?.storage_bucket || !tpl.storage_object_path) {
    return NextResponse.json({ error: "Template PDF not found." }, { status: 404 });
  }

  const { data: blob, error: dlErr } = await supabaseAdmin.storage
    .from(tpl.storage_bucket)
    .download(tpl.storage_object_path);

  if (dlErr || !blob) {
    return NextResponse.json(
      { error: dlErr?.message || "Could not download template PDF." },
      { status: 500 }
    );
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const url = new URL(request.url);
  const asAttachment = url.searchParams.get("download") === "1";
  const filename = safeDownloadFilename(tpl.name || "template-preview");

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": asAttachment ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
