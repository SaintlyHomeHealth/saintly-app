import { NextResponse } from "next/server";

import {
  applyLeadDocumentSuggestions,
  type ApplyLeadDocumentSuggestionsInput,
} from "@/lib/crm/lead-referral-document-ai";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId } = await ctx.params;
  const lid = typeof leadId === "string" ? leadId.trim() : "";
  if (!UUID_RE.test(lid)) {
    return NextResponse.json({ ok: false, error: "invalid_lead" }, { status: 400 });
  }

  let body: ApplyLeadDocumentSuggestionsInput = {
    selected_fields: {},
    selected_checklist_updates: [],
    notes: null,
  };
  try {
    body = (await req.json()) as ApplyLeadDocumentSuggestionsInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await applyLeadDocumentSuggestions(staff, lid, body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "forbidden" ? 403 : 500 });
  }

  return NextResponse.json({ ok: true });
}
