import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Phone } from "lucide-react";

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
import { ContactArchiveButton } from "@/app/admin/crm/contacts/_components/ContactArchiveButton";
import {
  crmActionBtnMuted,
  crmActionBtnSky,
  crmContactsToolbarCls,
  crmFilterInputCls,
  crmListRowHoverCls,
  crmListScrollOuterCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { buildDuplicateFlagsForBatch } from "@/lib/crm/contact-duplicate-detection";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const DIRECTORY_FETCH_LIMIT = 2000;
const DIRECTORY_DISPLAY_CAP = 125;

function buildFilterQueryString(sp: { type?: string; q?: string }): string {
  const u = new URLSearchParams();
  if (sp.type && sp.type !== "all") u.set("type", sp.type);
  if (sp.q?.trim()) u.set("q", sp.q.trim());
  const qs = u.toString();
  return qs ? `?${qs}` : "";
}

/** UI-only: omit detail lines when value is empty or the usual empty sentinel (no backend change). */
function hasContactDetailLine(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  if (!t) return false;
  if (t === "—") return false;
  return true;
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
  const toastParam = one("toast").trim();

  const supabase = await createServerSupabaseClient();

  const [{ data: contactRows, error: contactErr }, { data: patientRows }, { data: leadRows }] = await Promise.all([
    contactRowsActiveOnly(
      supabase
        .from("contacts")
        .select(
          "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, address_line_1, address_line_2, city, state, zip, contact_type, status, referral_source, owner_user_id, relationship_metadata, created_at, updated_at, archived_at"
        )
        .order("created_at", { ascending: false })
        .limit(DIRECTORY_FETCH_LIMIT)
    ),
    supabase.from("patients").select("id, contact_id, patient_status").limit(5000),
    leadRowsActiveOnly(
      supabase
        .from("leads")
        .select("id, contact_id, source, status, owner_user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5000)
    ),
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

  const duplicateFlags = buildDuplicateFlagsForBatch(contacts as ContactDirectoryDbRow[]);

  const chipBase =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition";
  const chipOff = `${chipBase} border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50`;
  const chipOn = `${chipBase} border-sky-300 bg-sky-50 text-sky-900`;

  const toastBanner =
    toastParam === "contact_archived" ? (
      <div
        role="status"
        className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm"
      >
        Contact removed from active lists. Related calls, messages, and history are unchanged.
      </div>
    ) : toastParam === "contact_archive_denied" ||
        toastParam === "contact_archive_failed" ||
        toastParam === "contact_archive_invalid" ||
        toastParam === "contact_archive_gone" ? (
      <div
        role="alert"
        className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm"
      >
        {toastParam === "contact_archive_denied"
          ? "You do not have permission to archive contacts."
          : toastParam === "contact_archive_gone"
            ? "That contact is already archived or could not be found."
            : toastParam === "contact_archive_invalid"
              ? "Missing contact. Refresh and try again."
              : "Could not archive the contact. Try again or check logs."}
      </div>
    ) : null;

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Directory"
        title="Contacts"
        description={
          <>
            People and organizations on file—search, filter by type, then open a row for the full contact profile
            (phones, address, payer metadata, and links to patient or lead charts).
            {contactErr ? <span className="mt-2 block text-sm text-red-700">{contactErr.message}</span> : null}
          </>
        }
      />

      {toastBanner}

      <div className={crmContactsToolbarCls}>
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
              className={`${crmFilterInputCls} min-w-[200px] flex-1`}
            />
            <button type="submit" className={crmPrimaryCtaCls}>
              Apply
            </button>
          </div>
        </form>
        <p className="text-xs text-slate-500">
          Showing {list.length} of {totalMatched} match{totalMatched === 1 ? "" : "es"}
          {contacts.length >= DIRECTORY_FETCH_LIMIT ? ` (scanning newest ${DIRECTORY_FETCH_LIMIT} contacts)` : ""}. Dup flags
          compare primary phone digits and email within that same loaded set.
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

      <div className={crmListScrollOuterCls}>
        <div className="min-w-[1040px] text-sm">
          <div className="hidden gap-x-6 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 md:grid md:grid-cols-[minmax(12rem,1.2fr)_minmax(15rem,1.35fr)_minmax(14rem,1.25fr)]">
            <div>Contact</div>
            <div>Details</div>
            <div className="text-right">Records &amp; actions</div>
          </div>
          {list.length === 0 ? (
            <div className="px-4 py-10 text-slate-500">No contacts match these filters.</div>
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
              const phoneLine = formatPhoneForDisplay(r.primary_phone);
              const displayName = contactDirectoryDisplayName(r);
              const dup = duplicateFlags.get(r.id);
              const dupLabel =
                dup && (dup.duplicateByPhone || dup.duplicateByEmail) ? dup.reasons.join(" · ") : null;
              const detailHref = `/admin/crm/contacts/${r.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

              return (
                <div
                  key={r.id}
                  className={`grid grid-cols-1 gap-x-6 gap-y-4 border-b border-slate-100 px-4 py-4 transition-all last:border-0 md:grid-cols-[minmax(12rem,1.2fr)_minmax(15rem,1.35fr)_minmax(14rem,1.25fr)] md:items-start ${crmListRowHoverCls}`}
                >
                  <div className="min-w-0 space-y-2">
                    <Link
                      href={detailHref}
                      className="block font-bold leading-snug text-slate-900 hover:text-sky-800 hover:underline"
                    >
                      {displayName}
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      {badges.map((b) => (
                        <span
                          key={b}
                          className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-sky-200/60"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                    {dupLabel ? (
                      <span
                        className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200/70"
                        title={`Possible duplicate within loaded list by: ${dupLabel}`}
                      >
                        {dup?.duplicateByPhone && dup?.duplicateByEmail
                          ? "Duplicate · phone+email"
                          : dup?.duplicateByPhone
                            ? "Duplicate · phone"
                            : "Duplicate · email"}
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 space-y-1.5 text-xs leading-relaxed text-slate-700">
                    {hasContactDetailLine(phoneLine) ? (
                      <div className="flex items-start gap-1.5">
                        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                        <span className="tabular-nums">{phoneLine}</span>
                      </div>
                    ) : null}
                    {hasContactDetailLine(r.email) ? (
                      <div className="flex min-w-0 items-start gap-1.5">
                        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 break-words">{(r.email ?? "").trim()}</span>
                      </div>
                    ) : null}
                    {hasContactDetailLine(sourceLabel) ? (
                      <div>
                        <span className="text-slate-500">Source</span> · {sourceLabel}
                      </div>
                    ) : null}
                    {owner ? (
                      <div>
                        <span className="text-slate-500">Owner</span> · {staffPrimaryLabel(owner)}
                      </div>
                    ) : null}
                    {hasContactDetailLine(statusLabel) ? (
                      <div>
                        <span className="text-slate-500">Status</span> · {statusLabel}
                      </div>
                    ) : null}
                    {hasContactDetailLine(cred) ? (
                      <div className="text-slate-600">
                        <span className="text-slate-500">Credentialing</span> · {cred}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex min-w-0 flex-col items-stretch gap-3 sm:items-end">
                    <div className="flex w-full flex-wrap justify-end gap-1.5">
                      {patient ? (
                        <Link href={`/admin/crm/patients/${patient.id}`} className={crmActionBtnSky}>
                          Patient
                        </Link>
                      ) : null}
                      {leads.map((l) => (
                        <Link key={l.id} href={`/admin/crm/leads/${l.id}`} className={crmActionBtnMuted}>
                          Lead
                        </Link>
                      ))}
                      {!patient && leads.length === 0 ? <span className="text-xs text-slate-400">No records</span> : null}
                    </div>
                    <div className="flex w-full justify-end border-t border-slate-100 pt-2">
                      <ContactArchiveButton contactId={r.id} archiveContext="list" variant="tableInline" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
