import { NextResponse } from "next/server";

import {
  isAllowedLeadReferralDocumentContentType,
  isLeadReferralDocumentType,
  LEAD_REFERRAL_DOCUMENT_MAX_BYTES,
} from "@/lib/crm/lead-referral-documents-constants";
import { loadLeadReferralDocumentsForLead, uploadLeadReferralDocuments } from "@/lib/crm/lead-referral-documents";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const leadId = typeof rawLeadId === "string" ? rawLeadId.trim() : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  const documents = await loadLeadReferralDocumentsForLead(leadId);
  return NextResponse.json({ ok: true, documents });
}

export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const leadId = typeof rawLeadId === "string" ? rawLeadId.trim() : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  const { data: leadRow } = await supabaseAdmin
    .from("leads")
    .select("id, referring_facility_id, referring_facility_contact_id")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!leadRow?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }
  if (file.size > LEAD_REFERRAL_DOCUMENT_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 400 });
  }

  const mime = file.type.trim() || "application/octet-stream";
  if (!isAllowedLeadReferralDocumentContentType(mime)) {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  const documentTypeRaw = formData.get("document_type");
  const documentType =
    typeof documentTypeRaw === "string" && isLeadReferralDocumentType(documentTypeRaw.trim())
      ? documentTypeRaw.trim()
      : null;

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim().slice(0, 4000) : null;

  const result = await uploadLeadReferralDocuments(
    {
      leadId,
      facilityId:
        typeof leadRow.referring_facility_id === "string" ? leadRow.referring_facility_id : null,
      contactId:
        typeof leadRow.referring_facility_contact_id === "string"
          ? leadRow.referring_facility_contact_id
          : null,
      uploadedByUserId: staff.user_id,
      uploadedByPublic: false,
    },
    [
      {
        file,
        fileName: file.name,
        mimeType: mime,
        fileSize: file.size,
        documentType,
        reviewNotes: notes,
      },
    ]
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  const uploaded = result.uploaded[0];
  if (!uploaded) {
    return NextResponse.json({ ok: false, error: result.failed[0]?.error ?? "upload_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: uploaded });
}
