import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  attachAdminCrmLeadListPredicates,
  EMPTY_CONTACT_SENTINEL,
  parseAdminCrmLeadsListSearchParams,
  type AdminCrmLeadListUrlFilters,
} from "@/lib/crm/admin-crm-leads-list-filters";
import { buildContactSearchOrClause } from "@/lib/crm/crm-leads-search";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import {
  contactDisplayName,
  contactEmail,
  normalizeContact,
  type CrmLeadRow,
} from "@/lib/crm/crm-leads-table-helpers";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";
import { csvRow, isMarketingEmailValid, normalizeMarketingEmail } from "@/lib/export/marketing-email-csv";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const LEADS_EMAIL_EXPORT_SELECT =
  "status, payer_name, primary_payer_name, secondary_payer_name, payer_type, contacts ( email, full_name, first_name, last_name, primary_phone, secondary_phone )";

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

function formatLeadPayerExport(row: {
  payer_name?: string | null;
  primary_payer_name?: string | null;
  secondary_payer_name?: string | null;
  payer_type?: string | null;
}): string {
  const candidates = [row.payer_name, row.primary_payer_name, row.secondary_payer_name, row.payer_type];
  for (const p of candidates) {
    const t = typeof p === "string" ? p.trim() : "";
    if (t) return t;
  }
  return "";
}

export async function GET(request: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = parseAdminCrmLeadsListSearchParams(rawSearchParamsRecord(url.searchParams));
  const followUpToday = parsed.followUp.toLowerCase() === "today";
  const urlFiltersForAttach: AdminCrmLeadListUrlFilters = {
    contactStatus: parsed.contactStatus,
    leadPriority: parsed.leadPriority,
    owner: parsed.owner,
    payer: parsed.payer,
    followUpToday,
    includeDead: parsed.includeDead,
  };

  let contactIdFilter: string[] | null = null;
  const contactOr = buildContactSearchOrClause(parsed.q);
  if (contactOr) {
    const { data: hits } = await contactRowsActiveOnly(supabaseAdmin.from("contacts").select("id").or(contactOr).limit(300));
    contactIdFilter = [...new Set((hits ?? []).map((h) => String(h.id)).filter(Boolean))];
    if (contactIdFilter.length === 0) {
      contactIdFilter = [EMPTY_CONTACT_SENTINEL];
    }
  }

  const deps = { contactIdFilter, todayIso: getCrmCalendarTodayIso() };

  const seenEmails = new Set<string>();
  const bodyCsvParts: string[] = [];

  let offset = 0;
  for (;;) {
    let q = leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select(LEADS_EMAIL_EXPORT_SELECT)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
    );
    q = attachAdminCrmLeadListPredicates(q, urlFiltersForAttach, deps) as typeof q;
    q = q.range(offset, offset + CHUNK - 1);

    const { data: rows, error } = await q;
    if (error) {
      console.warn("[crm/leads/export-emails]", error.message);
      return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as unknown as CrmLeadRow[];
    if (list.length === 0) break;

    for (const row of list) {
      const c = normalizeContact(row.contacts);
      const norm = normalizeMarketingEmail(contactEmail(c));
      if (!norm || !isMarketingEmailValid(norm)) continue;
      if (seenEmails.has(norm)) continue;
      seenEmails.add(norm);

      const fullName = contactDisplayName(c);
      const primary = typeof c?.primary_phone === "string" ? c.primary_phone.trim() : "";
      const secondary = typeof c?.secondary_phone === "string" ? c.secondary_phone.trim() : "";
      const rawPhone = primary || secondary;
      const phone = rawPhone ? formatPhoneForDisplay(rawPhone) : "";

      const payer = formatLeadPayerExport(row);
      const leadStatus = formatLeadPipelineStatusLabel(row.status);

      bodyCsvParts.push(csvRow([norm, fullName === "—" ? "" : fullName, phone, payer, leadStatus]));
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

  const header = csvRow(["email", "full_name", "phone", "payer", "lead_status"]);
  const csv = `\ufeff${header}${bodyCsvParts.join("")}`;
  const filename = `leads_emails_${getCrmCalendarTodayIso()}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
