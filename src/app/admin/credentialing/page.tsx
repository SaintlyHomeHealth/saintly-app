import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CREDENTIALING_LIST_SEGMENTS,
  type CredentialingListSegment,
  isCredentialingListSegment,
  isCredentialingPriority,
  type CredentialingPriorityValue,
} from "@/lib/crm/credentialing-status-options";
import {
  analyzePayerCredentialingAttention,
  computeCredentialingSummaryStats,
  CREDENTIALING_ATTENTION_REASON_LABELS,
  formatCredentialingDueDateLabel,
  hasReachableContact,
  payerCredentialingFollowUpIsStale,
  payerCredentialingReadyToBill,
  type PayerCredentialingListRow,
} from "@/lib/crm/credentialing-command-center";
import { summarizePayerDocuments } from "@/lib/crm/credentialing-documents";
import { loadCredentialingStaffLabelMap } from "@/lib/crm/credentialing-staff-directory";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ContractingStatusBadge,
  CredentialingDocsChecklistLink,
  CredentialingPriorityBadge,
  CredentialingStatusBadge,
  ReadyToBillBadge,
  RowAttentionHint,
} from "@/components/crm/CredentialingBadges";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PriorityFilter = "" | CredentialingPriorityValue;

function buildCredentialingHref(sp: {
  segment: CredentialingListSegment;
  q: string;
  priority?: PriorityFilter;
}): string {
  const u = new URLSearchParams();
  if (sp.segment !== "all") u.set("segment", sp.segment);
  if (sp.q.trim()) u.set("q", sp.q.trim());
  if (sp.priority && isCredentialingPriority(sp.priority)) u.set("priority", sp.priority);
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
  if (segment === "ready_to_bill") {
    return payerCredentialingReadyToBill(r.credentialing_status, r.contracting_status);
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

function matchesPriorityFilter(r: PayerCredentialingListRow, pf: PriorityFilter): boolean {
  if (!pf || !isCredentialingPriority(pf)) return true;
  return (r.priority ?? "medium").toLowerCase() === pf;
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
    r.next_action,
  ]
    .map((x) => (x ?? "").toLowerCase())
    .join(" ");
  return hay.includes(needle);
}

function normalizeCredentialingRows(raw: unknown[]): PayerCredentialingListRow[] {
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const updated = typeof r.updated_at === "string" ? r.updated_at : "";
    const created = typeof r.created_at === "string" ? r.created_at : updated;
    return {
      ...(row as PayerCredentialingListRow),
      created_at: created,
      updated_at: updated,
      priority: typeof r.priority === "string" ? r.priority : "medium",
      next_action: typeof r.next_action === "string" ? r.next_action : null,
      next_action_due_date: typeof r.next_action_due_date === "string" ? r.next_action_due_date : null,
    };
  });
}

function formatActivityAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = (Date.now() - t) / (1000 * 60 * 60 * 24);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${Math.floor(days)}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
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
  const prRaw = typeof raw.priority === "string" ? raw.priority.trim().toLowerCase() : "";
  const priorityFilter: PriorityFilter =
    prRaw === "high" || prRaw === "medium" || prRaw === "low" ? prRaw : "";

  const supabase = await createServerSupabaseClient();
  const { data: rows, error } = await supabase
    .from("payer_credentialing_records")
    .select(
      `id, payer_name, payer_type, market_state, credentialing_status, contracting_status,
       portal_url, primary_contact_name, primary_contact_phone, primary_contact_email,
       notes, last_follow_up_at, updated_at, created_at, assigned_owner_user_id,
       next_action, next_action_due_date, priority,
       payer_credentialing_documents ( id, doc_type, status, uploaded_at )`
    )
    .order("updated_at", { ascending: false })
    .limit(2000);

  const allList = normalizeCredentialingRows(rows ?? []);

  const recordIds = allList.map((r) => r.id);
  const lastActivityByRecord = new Map<string, { summary: string; created_at: string }>();
  if (recordIds.length > 0) {
    const { data: latestActs } = await supabase
      .from("payer_credentialing_latest_activity")
      .select("credentialing_record_id, summary, created_at")
      .in("credentialing_record_id", recordIds);
    for (const row of latestActs ?? []) {
      const rec = row as {
        credentialing_record_id: string;
        summary: string;
        created_at: string;
      };
      if (!lastActivityByRecord.has(rec.credentialing_record_id)) {
        lastActivityByRecord.set(rec.credentialing_record_id, {
          summary: rec.summary,
          created_at: rec.created_at,
        });
      }
    }
  }

  const stats = computeCredentialingSummaryStats(allList);

  const ownerIds = allList.map((r) => r.assigned_owner_user_id).filter((x): x is string => Boolean(x));
  const ownerLabels = await loadCredentialingStaffLabelMap(ownerIds);

  let list = allList.filter((r) => matchesSegment(r, segment));
  list = list.filter((r) => matchesPriorityFilter(r, priorityFilter));
  list = list.filter((r) => matchesSearch(r, qTrim));

  const chipBase =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition";
  const chipOff = `${chipBase} border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50`;
  const chipOn = `${chipBase} border-sky-300 bg-sky-50 text-sky-900`;
  const priChip = (pf: PriorityFilter) =>
    `${chipBase} ${priorityFilter === pf ? "border-rose-400 bg-rose-50 text-rose-950" : "border-slate-200 bg-white text-slate-600 hover:border-rose-200"}`;

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Operations"
        title="Payer credentialing"
        description={
          <>
            Payer pipeline: next actions, priorities, ready-to-bill, and automatic attention rules. Separate from{" "}
            <Link href="/admin/crm/contacts" className="font-semibold text-sky-800 hover:underline">
              Contacts
            </Link>
            .
          </>
        }
        actions={
          <Link
            href="/admin/credentialing/new"
            className="inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md"
          >
            New payer record
          </Link>
        }
      />

      {error ? (
        <p className="text-sm text-red-700">
          {error.message.includes("payer_credentialing") || error.message.includes("column")
            ? "Apply the latest credentialing migrations, then reload."
            : error.message}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Link
          href={buildCredentialingHref({ segment: "all", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-slate-200`}
        >
          <p className={statLabel}>Total</p>
          <p className={statValue}>{stats.total}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "ready_to_bill", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-emerald-300 bg-gradient-to-br from-emerald-50 to-white ring-1 ring-emerald-200/80`}
        >
          <p className={statLabel}>Ready to bill</p>
          <p className={`${statValue} text-emerald-900`}>{stats.readyToBill}</p>
          <p className="mt-1 text-[10px] font-semibold text-emerald-800">Enrolled + contracted</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "needs_attention", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-amber-200 bg-amber-50/80 ring-1 ring-amber-100`}
        >
          <p className={statLabel}>Needs attention</p>
          <p className={`${statValue} text-amber-950`}>{stats.needsAttention}</p>
          <p className="mt-1 text-[10px] leading-snug text-amber-900/90">
            Stale follow-up, no contact, docs, owner, stagnant submitted, idle queue
          </p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "docs_missing", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-violet-100 bg-violet-50/50`}
        >
          <p className={statLabel}>Docs missing</p>
          <p className={`${statValue} text-violet-950`}>{stats.docsMissing}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: segment, q: qTrim, priority: "high" })}
          className={`${statCardBase} border-rose-100 bg-rose-50/40`}
        >
          <p className={statLabel}>High priority</p>
          <p className={`${statValue} text-rose-950`}>{stats.highPriority}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "in_progress", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-amber-100 bg-amber-50/40`}
        >
          <p className={statLabel}>In progress</p>
          <p className={`${statValue} text-amber-950`}>{stats.inProgress}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "submitted", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-amber-100 bg-amber-50/40`}
        >
          <p className={statLabel}>Submitted</p>
          <p className={`${statValue} text-amber-950`}>{stats.submitted}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "enrolled", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-emerald-100 bg-emerald-50/50`}
        >
          <p className={statLabel}>Enrolled</p>
          <p className={`${statValue} text-emerald-900`}>{stats.enrolled}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "contracted", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-emerald-100 bg-emerald-50/50`}
        >
          <p className={statLabel}>Contracted</p>
          <p className={`${statValue} text-emerald-900`}>{stats.contracted}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "stalled", q: qTrim, priority: priorityFilter })}
          className={`${statCardBase} border-red-100 bg-red-50/40`}
        >
          <p className={statLabel}>Stalled (explicit)</p>
          <p className={`${statValue} text-red-900`}>{stats.stalled}</p>
        </Link>
      </section>

      <div className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <form method="get" className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
          {priorityFilter ? <input type="hidden" name="priority" value={priorityFilter} /> : null}
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-600">
            Search payers
            <input
              name="q"
              defaultValue={qTrim}
              placeholder="Name, contact, next action…"
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
            {qTrim || priorityFilter ? (
              <Link
                href={buildCredentialingHref({ segment, q: "", priority: "" })}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear search &amp; priority
              </Link>
            ) : null}
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pipeline filters</p>
        <div className="flex flex-wrap gap-2">
          {CREDENTIALING_LIST_SEGMENTS.map(({ value, label }) => (
            <Link
              key={value}
              href={buildCredentialingHref({ segment: value, q: qTrim, priority: priorityFilter })}
              className={segment === value ? chipOn : chipOff}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Priority</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildCredentialingHref({ segment, q: qTrim, priority: "" })}
            className={priorityFilter === "" ? chipOn : chipOff}
          >
            All priorities
          </Link>
          <Link
            href={buildCredentialingHref({ segment, q: qTrim, priority: "high" })}
            className={priChip("high")}
          >
            High only
          </Link>
          <Link
            href={buildCredentialingHref({ segment, q: qTrim, priority: "medium" })}
            className={priChip("medium")}
          >
            Medium only
          </Link>
          <Link
            href={buildCredentialingHref({ segment, q: qTrim, priority: "low" })}
            className={priChip("low")}
          >
            Low only
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-3 py-3">Payer</th>
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3">Bill</th>
              <th className="px-3 py-3">Next action</th>
              <th className="px-3 py-3">Owner</th>
              <th className="px-3 py-3">Type / mkt</th>
              <th className="px-3 py-3">Cred.</th>
              <th className="px-3 py-3">Contr.</th>
              <th className="px-3 py-3">Checklist</th>
              <th className="px-3 py-3">Watch</th>
              <th className="px-3 py-3">Portal</th>
              <th className="px-3 py-3">Contact</th>
              <th className="px-3 py-3">Last activity</th>
              <th className="px-3 py-3">F/U</th>
              <th className="px-3 py-3">Upd.</th>
              <th className="px-3 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-slate-500">
                  {qTrim || segment !== "all" || priorityFilter ? (
                    <>
                      No rows match.{" "}
                      <Link
                        href={buildCredentialingHref({ segment: "all", q: "", priority: "" })}
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
                const readyBill = payerCredentialingReadyToBill(r.credentialing_status, r.contracting_status);
                const contactOk = hasReachableContact(r);
                const lastAct = lastActivityByRecord.get(r.id);

                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{r.payer_name}</td>
                    <td className="px-3 py-3">
                      <CredentialingPriorityBadge priority={r.priority} />
                    </td>
                    <td className="px-3 py-3">{readyBill ? <ReadyToBillBadge /> : <span className="text-xs text-slate-400">—</span>}</td>
                    <td className="max-w-[200px] px-3 py-3 text-xs text-slate-700">
                      {(r.next_action ?? "").trim() ? (
                        <>
                          <p className="line-clamp-2 font-medium text-slate-900">{r.next_action}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Due: {formatCredentialingDueDateLabel(r.next_action_due_date)}
                          </p>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[100px] px-3 py-3 text-xs text-slate-700">
                      <span className="line-clamp-2" title={ownerName}>
                        {ownerName}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {(r.payer_type ?? "").trim() || "—"}
                      {(r.market_state ?? "").trim() ? (
                        <>
                          <br />
                          <span className="text-slate-500">{r.market_state}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <CredentialingStatusBadge status={r.credentialing_status} />
                    </td>
                    <td className="px-3 py-3">
                      <ContractingStatusBadge status={r.contracting_status} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <CredentialingDocsChecklistLink recordId={r.id} missing={docSum.missing} total={docSum.total} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      {att.needsAttention ? (
                        <RowAttentionHint title={reasonText} />
                      ) : (
                        <span className="text-xs text-slate-400">OK</span>
                      )}
                    </td>
                    <td className="max-w-[100px] px-3 py-3 text-xs">
                      {r.portal_url?.trim() ? (
                        <PortalLinkIcon href={r.portal_url.trim()} />
                      ) : (
                        <Link
                          href={`/admin/credentialing/${r.id}#record-portal`}
                          className="font-semibold text-sky-700 underline-offset-2 hover:underline"
                        >
                          Add portal
                        </Link>
                      )}
                    </td>
                    <td className="max-w-[160px] px-3 py-3 text-xs text-slate-700">
                      <div className="flex items-start gap-1">
                        {!contactOk && !readyBill ? (
                          <span className="shrink-0 text-amber-600" title="No phone or email on file">
                            ⚠️
                          </span>
                        ) : null}
                        <div className="min-w-0">
                          {(r.primary_contact_name ?? "").trim() || "—"}
                          {(r.primary_contact_phone ?? "").trim() ? (
                            <span className="mt-0.5 block tabular-nums text-slate-600">
                              {formatPhoneForDisplay(r.primary_contact_phone)}
                            </span>
                          ) : null}
                          {(r.primary_contact_email ?? "").trim() ? (
                            <span className="mt-0.5 block truncate text-slate-500">{r.primary_contact_email}</span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[180px] px-3 py-3 text-xs text-slate-600">
                      {lastAct ? (
                        <>
                          <p className="line-clamp-2 text-slate-800" title={lastAct.summary}>
                            {lastAct.summary}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{formatActivityAgo(lastAct.created_at)}</p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-3 text-xs tabular-nums ${stale ? "font-semibold text-amber-800" : "text-slate-600"}`}
                      title={stale ? `No follow-up in ${7}+ days (active lane)` : undefined}
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
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                      {new Date(r.updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <Link
                        href={`/admin/credentialing/${r.id}`}
                        className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                      {notesPreview ? (
                        <p className="mt-1 max-w-[120px] text-[10px] leading-snug text-slate-500" title={r.notes ?? ""}>
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
