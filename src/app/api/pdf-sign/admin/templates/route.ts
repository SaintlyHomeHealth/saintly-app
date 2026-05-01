import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const documentType = url.searchParams.get("documentType")?.trim();

  let q = supabaseAdmin
    .from("signature_templates")
    .select("id, name, document_type, version, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (documentType && ["generic_contract", "w9", "i9"].includes(documentType)) {
    q = q.eq("document_type", documentType);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}
