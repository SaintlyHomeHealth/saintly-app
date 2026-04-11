import { NextResponse } from "next/server";

import type { ApplicantSearchRow } from "@/lib/admin/applicant-search-types";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

function applicantLabel(row: ApplicantSearchRow): string {
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return name || row.email || "Unnamed";
}

/**
 * Admin-only typeahead for linking staff_profiles → applicants (payroll).
 */
export async function GET(req: Request) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(5, parseInt(searchParams.get("limit") ?? "30", 10) || 30));

  let query = supabaseAdmin
    .from("applicants")
    .select("id, first_name, last_name, email")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (qRaw.length >= 1) {
    const escaped = qRaw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pattern = `%${escaped}%`;
    query = query.or(`email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("[api/admin/applicants/search]", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as ApplicantSearchRow[];

  const qLower = qRaw.toLowerCase();
  if (qRaw.length >= 2) {
    rows.sort((a, b) => {
      const ae = (a.email ?? "").toLowerCase();
      const be = (b.email ?? "").toLowerCase();
      const aExact = ae === qLower ? 0 : 1;
      const bExact = be === qLower ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aStarts = ae.startsWith(qLower) ? 0 : 1;
      const bStarts = be.startsWith(qLower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return applicantLabel(a).localeCompare(applicantLabel(b));
    });
  }

  return NextResponse.json({ applicants: rows });
}
