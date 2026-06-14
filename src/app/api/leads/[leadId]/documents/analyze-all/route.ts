import { NextResponse } from "next/server";

import {
  analyzeLeadReferralDocumentsForLead,
  buildLeadDocumentIntakeSummary,
  isLeadReferralDocumentAiConfigured,
  leadReferralDocumentAiErrorMessage,
} from "@/lib/crm/lead-referral-document-ai";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId } = await ctx.params;
  const lid = typeof leadId === "string" ? leadId.trim() : "";
  if (!UUID_RE.test(lid)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  if (!isLeadReferralDocumentAiConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured", message: leadReferralDocumentAiErrorMessage("not_configured") },
      { status: 503 }
    );
  }

  const result = await analyzeLeadReferralDocumentsForLead(lid);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId } = await ctx.params;
  const lid = typeof leadId === "string" ? leadId.trim() : "";
  if (!UUID_RE.test(lid)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  const summary = await buildLeadDocumentIntakeSummary(lid);
  return NextResponse.json({ ok: true, summary });
}
