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
  type PayerCredentialingListRow,
} from "@/lib/crm/credentialing-command-center";
import {
  ContractingStatusBadge,
  CredentialingStatusBadge,
  RowAttentionHint,
} from "@/components/crm/CredentialingBadges";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function buildListHref(segment: CredentialingListSegment, attention: boolean): string {
  const u = new URLSearchParams();
  if (segment !== "all") u.set("segment", segment);
  if (attention) u.set("attention", "1");
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
  return true;
}

const statCardBase =
  "rounded-[20px] border bg-white px-4 py-3 shadow-sm transition hover:border-sky-200 hover:shadow-md";
const statLabel = "text-[10px] font-bold uppercase tracking-wide text-slate-500";
const statValue = "mt-1 text-2xl font-bold tabular-nums text-slate-900";

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
  const attentionOn =
    raw.attention === "1" ||
    raw.attention === "true" ||
    (typeof raw.attention === "string" && raw.attention.toLowerCase() === "yes");

  const supabase = await createServerSupabaseClient();
  const { data: rows, error } = await supabase
    .from("payer_credentialing_records")
    .select(
      "id, payer_name, payer_type, market_state, credentialing_status, contracting_status, portal_url, primary_contact_name, primary_contact_phone, primary_contact_email, notes, last_follow_up_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(2000);

  const allList = (rows ?? []) as PayerCredentialingListRow[];

  const stats = computeCredentialingSummaryStats(allList);

  let list = allList.filter((r) => matchesSegment(r, segment));
  if (attentionOn) {
    list = list.filter((r) => analyzePayerCredentialingAttention(r).needsAttention);
  }

  const chipBase =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition";
  const chipOff = `${chipBase} border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50`;
  const chipOn = `${chipBase} border-sky-300 bg-sky-50 text-sky-900`;
  const attentionChipOff = `${chipBase} border-amber-200 bg-white text-amber-900 hover:border-amber-300 hover:bg-amber-50`;
  const attentionChipOn = `${chipBase} border-amber-400 bg-amber-100 text-amber-950`;

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
            Command center for payer onboarding, enrollment, and contracting. Separate from the CRM{" "}
            <Link href="/admin/crm/contacts" className="font-semibold text-sky-800 hover:underline">
              Contacts
            </Link>{" "}
            directory.
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
          {error.message.includes("payer_credentialing_records")
            ? "Run the payer_credentialing database migration, then reload."
            : error.message}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Link href={buildListHref("all", false)} className={`${statCardBase} border-slate-200`}>
          <p className={statLabel}>Total</p>
          <p className={statValue}>{stats.total}</p>
        </Link>
        <Link href={buildListHref("in_progress", false)} className={`${statCardBase} border-amber-100 bg-amber-50/40`}>
          <p className={statLabel}>In progress</p>
          <p className={`${statValue} text-amber-950`}>{stats.inProgress}</p>
        </Link>
        <Link href={buildListHref("submitted", false)} className={`${statCardBase} border-amber-100 bg-amber-50/40`}>
          <p className={statLabel}>Submitted</p>
          <p className={`${statValue} text-amber-950`}>{stats.submitted}</p>
        </Link>
        <Link href={buildListHref("enrolled", false)} className={`${statCardBase} border-emerald-100 bg-emerald-50/50`}>
          <p className={statLabel}>Enrolled</p>
          <p className={`${statValue} text-emerald-900`}>{stats.enrolled}</p>
        </Link>
        <Link href={buildListHref("contracted", false)} className={`${statCardBase} border-emerald-100 bg-emerald-50/50`}>
          <p className={statLabel}>Contracted</p>
          <p className={`${statValue} text-emerald-900`}>{stats.contracted}</p>
        </Link>
        <Link href={buildListHref("stalled", false)} className={`${statCardBase} border-red-100 bg-red-50/40`}>
          <p className={statLabel}>Stalled</p>
          <p className={`${statValue} text-red-900`}>{stats.stalled}</p>
        </Link>
        <Link
          href={buildListHref("all", true)}
          className={`${statCardBase} border-amber-200 bg-amber-50/80 ring-1 ring-amber-100`}
        >
          <p className={statLabel}>Needs attention</p>
          <p className={`${statValue} text-amber-950`}>{stats.needsAttention}</p>
          <p className="mt-1 text-[10px] leading-snug text-amber-900/80">
            Stalled, stale follow-up, or missing portal/contact while active
          </p>
        </Link>
      </section>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filters</p>
        <div className="flex flex-wrap gap-2">
          {CREDENTIALING_LIST_SEGMENTS.map(({ value, label }) => (
            <Link key={value} href={buildListHref(value, attentionOn)} className={segment === value ? chipOn : chipOff}>
              {label}
            </Link>
          ))}
          <Link
            href={buildListHref(segment, !attentionOn)}
            className={attentionOn ? attentionChipOn : attentionChipOff}
          >
            {attentionOn ? "✓ Needs attention only" : "Needs attention only"}
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Payer</th>
              <th className="px-4 py-3">Type / market</th>
              <th className="px-4 py-3">Credentialing</th>
              <th className="px-4 py-3">Contracting</th>
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
                <td colSpan={10} className="px-4 py-8 text-slate-500">
                  {attentionOn ? (
                    <>
                      No rows match this filter.{" "}
                      <Link href={buildListHref(segment, false)} className="font-semibold text-sky-800 hover:underline">
                        Clear attention filter
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
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.payer_name}</td>
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
                      {att.needsAttention ? (
                        <RowAttentionHint title={reasonText} />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[140px] px-4 py-3 text-xs">
                      {r.portal_url?.trim() ? (
                        <a
                          href={r.portal_url.trim()}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                        >
                          Open
                        </a>
                      ) : (
                        "—"
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
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.last_follow_up_at
                        ? new Date(r.last_follow_up_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
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
