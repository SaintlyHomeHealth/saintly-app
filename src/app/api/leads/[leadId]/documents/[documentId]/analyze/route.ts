import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  analyzeLeadReferralDocument,
  leadReferralDocumentAiErrorMessage,
} from "@/lib/crm/lead-referral-document-ai";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ leadId: string; documentId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId, documentId } = await ctx.params;
  const lid = typeof leadId === "string" ? leadId.trim() : "";
  const did = typeof documentId === "string" ? documentId.trim() : "";
  if (!UUID_RE.test(lid) || !UUID_RE.test(did)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { data: docRow } = await supabaseAdmin
    .from("lead_referral_documents")
    .select("lead_id")
    .eq("id", did)
    .neq("status", "deleted")
    .maybeSingle();
  if (!docRow || String(docRow.lead_id) !== lid) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const result = await analyzeLeadReferralDocument(did);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, message: result.message },
      { status: result.error === "not_configured" ? 503 : 500 }
    );
  }

  return NextResponse.json({ ok: true, document_id: result.document_id, extraction: result.extraction });
}
