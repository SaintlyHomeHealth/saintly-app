import Link from "next/link";
import { redirect } from "next/navigation";

import {
  type ContactDirectoryDbRow,
  type LeadRowWithContact,
  type PatientLinkBrief,
  CONTACT_DIRECTORY_TYPE_FILTERS,
  buildRelationshipTypeBadges,
  contactDirectoryDisplayName,
  credentialingSummaryFromMetadata,
  groupLeadsByContactId,
  isContactDirectoryTypeFilter,
  matchesContactDirectorySearch,
  matchesContactDirectoryTypeFilter,
  resolveDirectoryOwnerUserId,
  resolveDirectorySourceLabel,
  resolveDirectoryStatusLabel,
} from "@/lib/crm/contact-directory";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const DIRECTORY_FETCH_LIMIT = 2000;
const DIRECTORY_DISPLAY_CAP = 125;

function staffPrimaryLabel(s: {
  user_id: string;
  email: string | null;
  full_name: string | null;
}): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) {
    const local = em.split("@")[0]?.trim();
    if (local) {
      const words = local.replace(/[._+-]+/g, " ").split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
    }
  }
  return `${s.user_id.slice(0, 8)}…`;
}

function buildFilterQueryString(sp: { type?: string; q?: string }): string {
  const u = new URLSearchParams();
  if (sp.type && sp.type !== "all") u.set("type", sp.type);
  if (sp.q?.trim()) u.set("q", sp.q.trim());
  const qs = u.toString();
  return qs ? `?${qs}` : "";
}

export default async function AdminCrmContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const rawSp = await searchParams;
  const one = (k: string) => {
    const v = rawSp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };

  const typeRaw = one("type").trim().toLowerCase() || "all";
  const typeFilter = isContactDirectoryTypeFilter(typeRaw) ? typeRaw : "all";
  const q = one("q").trim();

  const returnTo = buildFilterQueryString({ type: typeFilter, q });

  const supabase = await createServerSupabaseClient();

  const [{ data: contactRows, error: contactErr }, { data: patientRows }, { data: leadRows }] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, address_line_1, address_line_2, city, state, zip, contact_type, status, referral_source, owner_user_id, relationship_metadata, notes, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(DIRECTORY_FETCH_LIMIT),
    supabase.from("patients").select("id, contact_id, patient_status").limit(5000),
    supabase
      .from("leads")
      .select("id, contact_id, source, status, owner_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const contacts = (contactRows ?? []) as ContactDirectoryDbRow[];

  const patientByContactId = new Map<string, PatientLinkBrief>();
  for (const p of patientRows ?? []) {
    const cid = String((p as { contact_id: string }).contact_id);
    patientByContactId.set(cid, {
      id: String((p as { id: string }).id),
      patient_status: String((p as { patient_status: string }).patient_status),
    });
  }

  const leadsByContactId = groupLeadsByContactId((leadRows ?? []) as LeadRowWithContact[]);

  const ownerIds = new Set<string>();
  for (const c of contacts) {
    const leads = leadsByContactId.get(c.id) ?? [];
    const oid = resolveDirectoryOwnerUserId(c, leads);
    if (oid) ownerIds.add(oid);
  }

  const ownerList = [...ownerIds];
  const staffByUserId: Record<string, { user_id: string; email: string | null; full_name: string | null }> = {};
  if (ownerList.length > 0) {
    const { data: spRows } = await supabase
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .in("user_id", ownerList);
    for (const s of spRows ?? []) {
      const row = s as { user_id: string; email: string | null; full_name: string | null };
      staffByUserId[row.user_id] = row;
    }
  }

  let filtered = contacts.filter((row) =>
    matchesContactDirectoryTypeFilter(typeFilter, row, patientByContactId, leadsByContactId)
  );
  filtered = filtered.filter((row) => {
    const patient = patientByContactId.get(row.id) ?? null;
    const leads = leadsByContactId.get(row.id) ?? [];
    return matchesContactDirectorySearch(row, q, patient, leads);
  });

  const totalMatched = filtered.length;
  const list = filtered.slice(0, DIRECTORY_DISPLAY_CAP);

  const filterInputCls =
    "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm";
  const chipBase =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition";
  const chipOff = `${chipBase} border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50`;
  const chipOn = `${chipBase} border-sky-300 bg-sky-50 text-sky-900`;

  return (
    <div className="space-y-6 p-6">
      <nav className="flex flex-wrap gap-3 text-sm font-semibold text-sky-800">
        <Link href="/admin" className="underline-offset-2 hover:underline">
          Admin
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-900">Contacts</span>
        <Link href="/admin/crm/leads" className="underline-offset-2 hover:underline">
          Leads
        </Link>
        <Link href="/admin/crm/patients" className="underline-offset-2 hover:underline">
          Patients
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/dispatch" className="underline-offset-2 hover:underline">
          Dispatch
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/roster" className="underline-offset-2 hover:underline">
          Roster
        </Link>
      </nav>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CRM</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Contacts</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          People and organizations on file—search, filter by type, then open a row for the full contact profile (phones,
          address, payer metadata, and links to patient or lead charts).
        </p>
        {contactErr ? <p className="mt-2 text-sm text-red-700">{contactErr.message}</p> : null}
      </div>

      <div className="flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <form method="get" className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-1">
          <label className="text-xs font-semibold text-slate-600" htmlFor="crm-contacts-q">
            Search
          </label>
          <div className="flex flex-wrap gap-2">
            <input type="hidden" name="type" value={typeFilter === "all" ? "" : typeFilter} />
            <input
              id="crm-contacts-q"
              name="q"
              defaultValue={q}
              placeholder="Name, email, phone, plan id…"
              className={`${filterInputCls} min-w-[200px] flex-1`}
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md hover:shadow-sky-200/80 sm:text-sm"
            >
              Apply
            </button>
          </div>
        </form>
        <p className="text-xs text-slate-500">
          Showing {list.length} of {totalMatched} match{totalMatched === 1 ? "" : "es"}
          {contacts.length >= DIRECTORY_FETCH_LIMIT ? ` (scanning newest ${DIRECTORY_FETCH_LIMIT} contacts)` : ""}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CONTACT_DIRECTORY_TYPE_FILTERS.map(({ value, label }) => {
          const active = typeFilter === value;
          const href =
            value === "all"
              ? `/admin/crm/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`
              : `/admin/crm/contacts?type=${encodeURIComponent(value)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
          return (
            <Link key={value} href={href} className={active ? chipOn : chipOff}>
              {label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Credentialing</th>
              <th className="px-4 py-3">Records</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-slate-500">
                  No contacts match these filters.
                </td>
              </tr>
            ) : (
              list.map((r) => {
                const patient = patientByContactId.get(r.id) ?? null;
                const leads = leadsByContactId.get(r.id) ?? [];
                const badges = buildRelationshipTypeBadges(r, patient, leads);
                const ownerId = resolveDirectoryOwnerUserId(r, leads);
                const owner = ownerId ? staffByUserId[ownerId] : null;
                const sourceLabel = resolveDirectorySourceLabel(r, leads);
                const statusLabel = resolveDirectoryStatusLabel(r, patient, leads);
                const cred = credentialingSummaryFromMetadata(r.relationship_metadata);
                const displayName = contactDirectoryDisplayName(r);
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/contacts/${r.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
                        className="font-medium text-sky-800 underline-offset-2 hover:underline"
                      >
                        {displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-700">
                      {formatPhoneForDisplay(r.primary_phone)}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-slate-700">{r.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {badges.map((b) => (
                          <span
                            key={b}
                            className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="max-w-[140px] px-4 py-3 text-xs text-slate-700">{statusLabel}</td>
                    <td className="max-w-[120px] px-4 py-3 text-xs text-slate-700">
                      {owner ? staffPrimaryLabel(owner) : "—"}
                    </td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-xs text-slate-600">{sourceLabel}</td>
                    <td className="max-w-[160px] px-4 py-3 text-xs text-slate-600">{cred}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-col gap-1">
                        {patient ? (
                          <Link
                            href={`/admin/crm/patients/${patient.id}`}
                            className="text-sky-800 underline-offset-2 hover:underline"
                          >
                            Patient
                          </Link>
                        ) : null}
                        {leads.map((l) => (
                          <Link
                            key={l.id}
                            href={`/admin/crm/leads/${l.id}`}
                            className="text-sky-800 underline-offset-2 hover:underline"
                          >
                            Lead
                          </Link>
                        ))}
                        {!patient && leads.length === 0 ? <span className="text-slate-400">—</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
