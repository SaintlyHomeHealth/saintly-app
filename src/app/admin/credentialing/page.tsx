import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CREDENTIALING_LIST_SEGMENTS,
  type CredentialingListSegment,
  isCredentialingListSegment,
} from "@/lib/crm/credentialing-status-options";
import {
  analyzePayerCredentialingAttention,
  computeCredentialingSummaryStats,
  CREDENTIALING_ATTENTION_REASON_LABELS,
  payerCredentialingFollowUpIsStale,
  type PayerCredentialingListRow,
} from "@/lib/crm/credentialing-command-center";
import { summarizePayerDocuments } from "@/lib/crm/credentialing-documents";
import { loadCredentialingStaffLabelMap } from "@/lib/crm/credentialing-staff-directory";
import {
  ContractingStatusBadge,
  CredentialingStatusBadge,
  DocsMissingHint,
  RowAttentionHint,
} from "@/components/crm/CredentialingBadges";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function buildCredentialingHref(sp: { segment: CredentialingListSegment; q: string }): string {
  const u = new URLSearchParams();
  if (sp.segment !== "all") u.set("segment", sp.segment);
  if (sp.q.trim()) u.set("q", sp.q.trim());
  const qs = u.toString();
  return qs ? `/admin/credentialing?${qs}` : "/admin/credentialing";
}

function matchesSegment(r: PayerCredentialingListRow, segment: CredentialingListSegment): boolean {
  if (segment === "all") return true;
  if (segment === "in_progress") return r.credentialing_status === "in_progress";
  if (segment === "submitted") return r.credentialing_status === "submitted";
  if (segment === "enrolled") return r.credentialing_status === "enrolled";
  if (segment === "contracted") return r.contracting_status === "contracted";
  if (segment === "stalled") {
    return r.credentialing_status === "stalled" || r.contracting_status === "stalled";
  }
  if (segment === "needs_attention") {
    return analyzePayerCredentialingAttention(r).needsAttention;
  }
  if (segment === "docs_missing") {
    const docs = r.payer_credentialing_documents ?? [];
    return docs.length > 0 && summarizePayerDocuments(docs).hasMissing;
  }
  return true;
}

function matchesSearch(r: PayerCredentialingListRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    r.payer_name,
    r.primary_contact_name,
    r.primary_contact_phone,
    r.primary_contact_email,
    r.portal_url,
  ]
    .map((x) => (x ?? "").toLowerCase())
    .join(" ");
  return hay.includes(needle);
}

const statCardBase =
  "rounded-[20px] border bg-white px-4 py-3 shadow-sm transition hover:border-sky-200 hover:shadow-md";
const statLabel = "text-[10px] font-bold uppercase tracking-wide text-slate-500";
const statValue = "mt-1 text-2xl font-bold tabular-nums text-slate-900";
const filterInputCls =
  "min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm";

function PortalLinkIcon({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-900 hover:bg-sky-100"
      title="Open payer portal (new tab)"
    >
      <span aria-hidden className="text-xs leading-none">
        ↗
      </span>
      Portal
    </a>
  );
}

export default async function AdminCredentialingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const raw = await searchParams;
  const segRaw = typeof raw.segment === "string" ? raw.segment.trim().toLowerCase() : "";
  const segment: CredentialingListSegment = isCredentialingListSegment(segRaw) ? segRaw : "all";
  const q = typeof raw.q === "string" ? raw.q : Array.isArray(raw.q) ? raw.q[0] ?? "" : "";
  const qTrim = q.trim();

  const supabase = await createServerSupabaseClient();
  const { data: rows, error } = await supabase
    .from("payer_credentialing_records")
    .select(
      `id, payer_name, payer_type, market_state, credentialing_status, contracting_status,
       portal_url, primary_contact_name, primary_contact_phone, primary_contact_email,
       notes, last_follow_up_at, updated_at, assigned_owner_user_id,
       payer_credentialing_documents ( id, doc_type, status, uploaded_at )`
    )
    .order("updated_at", { ascending: false })
    .limit(2000);

  const allList = (rows ?? []) as PayerCredentialingListRow[];

  const stats = computeCredentialingSummaryStats(allList);

  const ownerIds = allList.map((r) => r.assigned_owner_user_id).filter((x): x is string => Boolean(x));
  const ownerLabels = await loadCredentialingStaffLabelMap(ownerIds);

  let list = allList.filter((r) => matchesSegment(r, segment));
  list = list.filter((r) => matchesSearch(r, qTrim));

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
        <Link href="/admin/crm/contacts" className="underline-offset-2 hover:underline">
          Contacts
        </Link>
        <Link href="/admin/crm/leads" className="underline-offset-2 hover:underline">
          Leads
        </Link>
        <Link href="/admin/crm/patients" className="underline-offset-2 hover:underline">
          Patients
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-900">Credentialing</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Payer credentialing</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Enrollment and contracting command center—owners, documents, follow-up discipline, and timeline. Separate
            from CRM{" "}
            <Link href="/admin/crm/contacts" className="font-semibold text-sky-800 hover:underline">
              Contacts
            </Link>
            .
          </p>
        </div>
        <Link
          href="/admin/credentialing/new"
          className="inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md"
        >
          New payer record
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-700">
          {error.message.includes("payer_credentialing") || error.message.includes("column")
            ? "Apply the latest credentialing migrations (documents / activity / owner), then reload."
            : error.message}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Link
          href={buildCredentialingHref({ segment: "all", q: qTrim })}
          className={`${statCardBase} border-slate-200`}
        >
          <p className={statLabel}>Total</p>
          <p className={statValue}>{stats.total}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "in_progress", q: qTrim })}
          className={`${statCardBase} border-amber-100 bg-amber-50/40`}
        >
          <p className={statLabel}>In progress</p>
          <p className={`${statValue} text-amber-950`}>{stats.inProgress}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "submitted", q: qTrim })}
          className={`${statCardBase} border-amber-100 bg-amber-50/40`}
        >
          <p className={statLabel}>Submitted</p>
          <p className={`${statValue} text-amber-950`}>{stats.submitted}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "enrolled", q: qTrim })}
          className={`${statCardBase} border-emerald-100 bg-emerald-50/50`}
        >
          <p className={statLabel}>Enrolled</p>
          <p className={`${statValue} text-emerald-900`}>{stats.enrolled}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "contracted", q: qTrim })}
          className={`${statCardBase} border-emerald-100 bg-emerald-50/50`}
        >
          <p className={statLabel}>Contracted</p>
          <p className={`${statValue} text-emerald-900`}>{stats.contracted}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "stalled", q: qTrim })}
          className={`${statCardBase} border-red-100 bg-red-50/40`}
        >
          <p className={statLabel}>Stalled</p>
          <p className={`${statValue} text-red-900`}>{stats.stalled}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "needs_attention", q: qTrim })}
          className={`${statCardBase} border-amber-200 bg-amber-50/80 ring-1 ring-amber-100`}
        >
          <p className={statLabel}>Needs attention</p>
          <p className={`${statValue} text-amber-950`}>{stats.needsAttention}</p>
          <p className="mt-1 text-[10px] leading-snug text-amber-900/80">
            Stalled, stale 14d+, missing contact/docs, no owner
          </p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "docs_missing", q: qTrim })}
          className={`${statCardBase} border-violet-100 bg-violet-50/50`}
        >
          <p className={statLabel}>Docs missing</p>
          <p className={`${statValue} text-violet-950`}>{stats.docsMissing}</p>
        </Link>
      </section>

      <div className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <form method="get" className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-600">
            Search payers
            <input
              name="q"
              defaultValue={qTrim}
              placeholder="Name, contact, portal URL…"
              className={filterInputCls}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Search
            </button>
            {qTrim ? (
              <Link
                href={buildCredentialingHref({ segment, q: "" })}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status filters</p>
        <div className="flex flex-wrap gap-2">
          {CREDENTIALING_LIST_SEGMENTS.map(({ value, label }) => (
            <Link
              key={value}
              href={buildCredentialingHref({ segment: value, q: qTrim })}
              className={segment === value ? chipOn : chipOff}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Type / market</th>
              <th className="px-4 py-3">Credentialing</th>
              <th className="px-4 py-3">Contracting</th>
              <th className="px-4 py-3">Docs</th>
              <th className="px-4 py-3">Watch</th>
              <th className="px-4 py-3">Portal</th>
              <th className="px-4 py-3">Primary contact</th>
              <th className="px-4 py-3">Last follow-up</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-slate-500">
                  {qTrim || segment !== "all" ? (
                    <>
                      No rows match.{" "}
                      <Link
                        href={buildCredentialingHref({ segment: "all", q: "" })}
                        className="font-semibold text-sky-800 hover:underline"
                      >
                        Reset filters
                      </Link>
                    </>
                  ) : (
                    <>
                      No payer records yet.{" "}
                      <Link href="/admin/credentialing/new" className="font-semibold text-sky-800 hover:underline">
                        Add one
                      </Link>
                      .
                    </>
                  )}
                </td>
              </tr>
            ) : (
              list.map((r) => {
                const notesPreview = (r.notes ?? "").trim().slice(0, 80);
                const att = analyzePayerCredentialingAttention(r);
                const reasonText = att.reasons.map((x) => CREDENTIALING_ATTENTION_REASON_LABELS[x]).join(" · ");
                const docs = r.payer_credentialing_documents ?? [];
                const docSum = summarizePayerDocuments(docs);
                const stale = payerCredentialingFollowUpIsStale(r);
                const ownerId = r.assigned_owner_user_id?.trim() ?? "";
                const ownerName = ownerId ? ownerLabels.get(ownerId) ?? "—" : "—";

                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.payer_name}</td>
                    <td className="max-w-[120px] px-4 py-3 text-xs text-slate-700">
                      <span className="line-clamp-2" title={ownerName}>
                        {ownerName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {(r.payer_type ?? "").trim() || "—"}
                      {(r.market_state ?? "").trim() ? (
                        <>
                          <br />
                          <span className="text-slate-500">{r.market_state}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <CredentialingStatusBadge status={r.credentialing_status} />
                    </td>
                    <td className="px-4 py-3">
                      <ContractingStatusBadge status={r.contracting_status} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      {docSum.total > 0 ? (
                        <DocsMissingHint missing={docSum.missing} total={docSum.total} />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {att.needsAttention ? (
                        <RowAttentionHint title={reasonText} />
                      ) : (
                        <span className="text-xs text-slate-400">OK</span>
                      )}
                    </td>
                    <td className="max-w-[120px] px-4 py-3 text-xs">
                      {r.portal_url?.trim() ? (
                        <PortalLinkIcon href={r.portal_url.trim()} />
                      ) : (
                        <span className="text-slate-400">No portal</span>
                      )}
                    </td>
                    <td className="max-w-[180px] px-4 py-3 text-xs text-slate-700">
                      {(r.primary_contact_name ?? "").trim() || "—"}
                      {(r.primary_contact_phone ?? "").trim() ? (
                        <span className="mt-0.5 block tabular-nums text-slate-600">
                          {formatPhoneForDisplay(r.primary_contact_phone)}
                        </span>
                      ) : null}
                      {(r.primary_contact_email ?? "").trim() ? (
                        <span className="mt-0.5 block truncate text-slate-500">{r.primary_contact_email}</span>
                      ) : null}
                    </td>
                    <td
                      className={`px-4 py-3 text-xs tabular-nums ${stale ? "font-semibold text-amber-800" : "text-slate-600"}`}
                      title={stale ? "Follow-up overdue (14+ days in active lane)" : undefined}
                    >
                      {r.last_follow_up_at
                        ? new Date(r.last_follow_up_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                      {stale ? <span className="ml-1 text-[10px] uppercase">Aging</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(r.updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Link
                        href={`/admin/credentialing/${r.id}`}
                        className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                      {notesPreview ? (
                        <p className="mt-1 max-w-[140px] text-[10px] leading-snug text-slate-500" title={r.notes ?? ""}>
                          {notesPreview}
                          {(r.notes ?? "").length > 80 ? "…" : ""}
                        </p>
                      ) : null}
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
