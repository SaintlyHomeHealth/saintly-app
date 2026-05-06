import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  isAllowedLeadAttachmentContentType,
  LEAD_ATTACHMENT_CATEGORY_OPTIONS,
  LEAD_ATTACHMENT_MAX_BYTES,
  LEAD_ATTACHMENTS_BUCKET,
  isLeadAttachmentCategory,
} from "@/lib/crm/lead-attachments-constants";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeFileName(name: string): string {
  const base = typeof name === "string" && name.trim() ? name.trim() : "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.slice(0, 180) || "file";
}

/**
 * Lead attachment upload. Security: authenticated CRM row-policy staff only (`isCrmLeadsRowPolicyRole`),
 * private bucket (`lead-attachments`, non-public), validates lead UUID + row exists, category allow-list,
 * MIME allow-list, LEAD_ATTACHMENT_MAX_BYTES on declared size and buffer length, signed URLs for read (see file route).
 */
export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" as const }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const leadId = typeof rawLeadId === "string" ? rawLeadId.trim() : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" as const }, { status: 400 });
  }

  const { data: leadRow } = await supabaseAdmin.from("leads").select("id").eq("id", leadId).is("deleted_at", null).maybeSingle();
  if (!leadRow?.id) {
    return NextResponse.json({ ok: false, error: "not_found" as const }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" as const }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "missing_file" as const }, { status: 400 });
  }

  if (file.size > LEAD_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" as const }, { status: 400 });
  }

  const categoryRaw = formData.get("category");
  const categoryStr = typeof categoryRaw === "string" ? categoryRaw.trim() : "";
  if (!isLeadAttachmentCategory(categoryStr)) {
    return NextResponse.json(
      { ok: false, error: "invalid_category" as const, allowed: LEAD_ATTACHMENT_CATEGORY_OPTIONS },
      { status: 400 }
    );
  }

  const noteRaw = formData.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim().slice(0, 4000) : null;

  const mime = file.type.trim() || "application/octet-stream";
  if (!isAllowedLeadAttachmentContentType(mime)) {
    return NextResponse.json({ ok: false, error: "invalid_type" as const }, { status: 400 });
  }

  const attachmentId = crypto.randomUUID();
  const safeName = sanitizeFileName(file.name);
  const objectPath = `${leadId}/${attachmentId}-${safeName}`;

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > LEAD_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" as const }, { status: 400 });
  }

  const { error: upErr } = await supabaseAdmin.storage.from(LEAD_ATTACHMENTS_BUCKET).upload(objectPath, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    console.warn("[lead attachments] upload:", upErr.message);
    return NextResponse.json({ ok: false, error: "upload_failed" as const }, { status: 500 });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("lead_attachments")
    .insert({
      id: attachmentId,
      lead_id: leadId,
      uploaded_by: staff.user_id,
      file_name: file.name.trim().slice(0, 500) || safeName,
      file_path: objectPath,
      content_type: mime,
      size_bytes: file.size,
      category: categoryStr,
      note,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !inserted?.id) {
    await supabaseAdmin.storage.from(LEAD_ATTACHMENTS_BUCKET).remove([objectPath]);
    console.warn("[lead attachments] insert:", insErr?.message);
    return NextResponse.json({ ok: false, error: "save_failed" as const }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, id: inserted.id });
}
