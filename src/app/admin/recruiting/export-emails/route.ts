import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { csvRow, isMarketingEmailValid, normalizeMarketingEmail } from "@/lib/export/marketing-email-csv";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  attachAdminRecruitingListPredicates,
  parseAdminRecruitingListSearchParams,
} from "@/lib/recruiting/admin-recruiting-list-filters";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const RECRUITING_EMAIL_EXPORT_SELECT = "full_name, phone, email, discipline";

const CHUNK = 500;

function rawSearchParamsRecord(sp: URLSearchParams): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of sp.entries()) {
    const cur = out[k];
    if (cur === undefined) out[k] = v;
    else if (typeof cur === "string") out[k] = [cur, v];
    else cur.push(v);
  }
  return out;
}

type RecruitExportRow = {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  discipline: string | null;
};

export async function GET(request: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const f = parseAdminRecruitingListSearchParams(rawSearchParamsRecord(url.searchParams));

  const seenEmails = new Set<string>();
  const bodyCsvParts: string[] = [];

  let offset = 0;
  for (;;) {
    let q = supabaseAdmin.from("recruiting_candidates").select(RECRUITING_EMAIL_EXPORT_SELECT);
    q = attachAdminRecruitingListPredicates(q, f) as typeof q;
    q = q.order("updated_at", { ascending: false }).range(offset, offset + CHUNK - 1);

    const { data: rows, error } = await q;
    if (error) {
      console.warn("[recruiting/export-emails]", error.message);
      return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as RecruitExportRow[];
    if (list.length === 0) break;

    for (const r of list) {
      const norm = normalizeMarketingEmail(r.email);
      if (!norm || !isMarketingEmailValid(norm)) continue;
      if (seenEmails.has(norm)) continue;
      seenEmails.add(norm);

      const fullName = typeof r.full_name === "string" ? r.full_name.trim() : "";
      const rawPhone = typeof r.phone === "string" ? r.phone.trim() : "";
      const phone = rawPhone ? formatPhoneForDisplay(rawPhone) : "";
      const role = typeof r.discipline === "string" ? r.discipline.trim() : "";

      bodyCsvParts.push(csvRow([norm, fullName, phone, role]));
    }

    offset += CHUNK;
    if (list.length < CHUNK) break;
  }

  if (seenEmails.size === 0) {
    return NextResponse.json(
      { error: "no_emails", message: "No emails found for current filters" },
      { status: 404 }
    );
  }

  const header = csvRow(["email", "full_name", "phone", "role"]);
  const csv = `\ufeff${header}${bodyCsvParts.join("")}`;
  const filename = `recruits_emails_${getCrmCalendarTodayIso()}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
