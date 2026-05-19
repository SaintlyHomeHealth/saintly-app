import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { LEAD_DOCUMENTS_BUCKET } from "@/lib/crm/lead-documents-storage";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

type RouteCtx = { params: Promise<{ leadId: string; docId: string }> };

/** Admin/manager signed URL for lead_documents (Medicare/insurance cards). */
export async function GET(_request: Request, ctx: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { leadId, docId } = await ctx.params;

  const { data: doc, error } = await supabaseAdmin
    .from("lead_documents")
    .select("id, storage_path, storage_bucket")
    .eq("id", docId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error || !doc?.storage_path) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bucket = doc.storage_bucket?.trim() || LEAD_DOCUMENTS_BUCKET;
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(doc.storage_path, 3600);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
