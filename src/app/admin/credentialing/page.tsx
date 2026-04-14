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
  formatCredentialingDueDateLabel,
  payerCredentialingReadyToBill,
  type PayerCredentialingListRow,
} from "@/lib/crm/credentialing-command-center";
import { summarizePayerDocuments } from "@/lib/crm/credentialing-documents";
import {
  computeCredentialingPipelineBlocker,
  computeCredentialingPipelineStage,
  computeCredentialingSummaryBuckets,
  credentialingPipelineBlockerBadgeClass,
  credentialingPipelineStageBadgeClass,
  CREDENTIALING_PIPELINE_BLOCKER_LABELS,
  CREDENTIALING_PIPELINE_STAGE_LABELS,
  getCredentialingSummaryBucketForRow,
  isCredentialingSummaryBucket,
  matchesCredentialingSummaryBucket,
  type CredentialingSummaryBucket,
} from "@/lib/crm/credentialing-pipeline-display";
import { loadCredentialingStaffLabelMap } from "@/lib/crm/credentialing-staff-directory";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PriorityFilter = "" | CredentialingPriorityValue;

function buildCredentialingHref(sp: {
  segment: CredentialingListSegment;
  q: string;
  priority?: PriorityFilter;
  bucket?: CredentialingSummaryBucket | "";
}): string {
  const u = new URLSearchParams();
  if (sp.segment !== "all") u.set("segment", sp.segment);
  if (sp.q.trim()) u.set("q", sp.q.trim());
  if (sp.priority && isCredentialingPriority(sp.priority)) u.set("priority", sp.priority);
  if (sp.bucket && isCredentialingSummaryBucket(sp.bucket)) u.set("bucket", sp.bucket);
  const qs = u.toString();
  return qs ? `/admin/credentialing?${qs}` : "/admin/credentialing";
}

function matchesSegment(r: PayerCredentialingListRow, segment: CredentialingListSegment): boolean {
  if (segment === "all") return true;
  // Align with summary "In progress" bucket (same as row pipeline stage), not raw DB status alone.
  if (segment === "in_progress") return getCredentialingSummaryBucketForRow(r) === "in_progress";
  if (segment === "submitted") return r.credentialing_status === "submitted";
  if (segment === "enrolled") return r.credentialing_status === "enrolled";
  if (segment === "contracted") return r.contracting_status === "contracted";
  if (segment === "stalled") {
    return r.credentialing_status === "stalled" || r.contracting_status === "stalled";
  }
  if (segment === "denied") {
    return r.credentialing_status === "denied";
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
  const extraEmails = (r.payer_credentialing_record_emails ?? []).map((e) => e.email);
  const hay = [
    r.payer_name,
    r.primary_contact_name,
    r.primary_contact_phone,
    r.primary_contact_phone_direct,
    r.primary_contact_fax,
    r.primary_contact_email,
    ...extraEmails,
    r.portal_url,
    r.next_action,
    r.denial_reason,
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
    const nested =
      Array.isArray(r.payer_credentialing_record_emails) && r.payer_credentialing_record_emails.length > 0
        ? (r.payer_credentialing_record_emails as { email?: string }[])
            .map((e) => ({ email: typeof e.email === "string" ? e.email : "" }))
            .filter((e) => e.email.trim())
        : null;
    return {
      ...(row as PayerCredentialingListRow),
      created_at: created,
      updated_at: updated,
      priority: typeof r.priority === "string" ? r.priority : "medium",
      next_action: typeof r.next_action === "string" ? r.next_action : null,
      next_action_due_date: typeof r.next_action_due_date === "string" ? r.next_action_due_date : null,
      denial_reason: typeof r.denial_reason === "string" ? r.denial_reason : null,
      primary_contact_phone_direct:
        typeof r.primary_contact_phone_direct === "string" ? r.primary_contact_phone_direct : null,
      primary_contact_fax: typeof r.primary_contact_fax === "string" ? r.primary_contact_fax : null,
      payer_credentialing_record_emails: nested,
    };
  });
}

const statCardBase =
  "rounded-[20px] border bg-white px-4 py-3 shadow-sm transition hover:border-sky-200 hover:shadow-md";
const statLabel = "text-[10px] font-bold uppercase tracking-wide text-slate-500";
const statValue = "mt-1 text-2xl font-bold tabular-nums text-slate-900";
const filterInputCls =
  "min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm";

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
  const bucketRaw = typeof raw.bucket === "string" ? raw.bucket.trim().toLowerCase() : "";
  const bucket: CredentialingSummaryBucket | "" = isCredentialingSummaryBucket(bucketRaw) ? bucketRaw : "";
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
       portal_url, primary_contact_name, primary_contact_phone, primary_contact_phone_direct, primary_contact_fax,
       primary_contact_email,
       notes, last_follow_up_at, updated_at, created_at, assigned_owner_user_id,
       next_action, next_action_due_date, priority, denial_reason,
       payer_credentialing_record_emails ( email ),
       payer_credentialing_documents ( id, doc_type, status, uploaded_at )`
    )
    .order("updated_at", { ascending: false })
    .limit(2000);

  const allList = normalizeCredentialingRows(rows ?? []);

  const bucketStats = computeCredentialingSummaryBuckets(allList);

  const ownerIds = allList.map((r) => r.assigned_owner_user_id).filter((x): x is string => Boolean(x));
  const ownerLabels = await loadCredentialingStaffLabelMap(ownerIds);

  let list = allList;
  if (bucket) {
    list = list.filter((r) => matchesCredentialingSummaryBucket(r, bucket));
  } else {
    list = list.filter((r) => matchesSegment(r, segment));
  }
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
            One pipeline stage and one next action per payer — open a record for checklist, portal, and contacts. Separate
            from{" "}
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

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Link
          href={buildCredentialingHref({ segment: "all", q: qTrim, priority: priorityFilter, bucket: "not_started" })}
          className={`${statCardBase} ${bucket === "not_started" ? "border-slate-800/25 ring-2 ring-slate-300/80" : "border-slate-200"}`}
        >
          <p className={statLabel}>Not started</p>
          <p className={statValue}>{bucketStats.not_started}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "all", q: qTrim, priority: priorityFilter, bucket: "in_progress" })}
          className={`${statCardBase} ${bucket === "in_progress" ? "border-slate-800/25 ring-2 ring-slate-300/80" : "border-slate-200"}`}
        >
          <p className={statLabel}>In progress</p>
          <p className={statValue}>{bucketStats.in_progress}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "all", q: qTrim, priority: priorityFilter, bucket: "submitted" })}
          className={`${statCardBase} ${bucket === "submitted" ? "border-slate-800/25 ring-2 ring-slate-300/80" : "border-slate-200"}`}
        >
          <p className={statLabel}>Submitted</p>
          <p className={statValue}>{bucketStats.submitted}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "all", q: qTrim, priority: priorityFilter, bucket: "active" })}
          className={`${statCardBase} ${bucket === "active" ? "border-emerald-300 ring-2 ring-emerald-200/80" : "border-emerald-100 bg-emerald-50/40"}`}
        >
          <p className={statLabel}>Active</p>
          <p className={`${statValue} text-emerald-900`}>{bucketStats.active}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "all", q: qTrim, priority: priorityFilter, bucket: "blocked" })}
          className={`${statCardBase} ${bucket === "blocked" ? "border-slate-800/25 ring-2 ring-slate-300/80" : "border-slate-200"}`}
        >
          <p className={statLabel}>Blocked</p>
          <p className={statValue}>{bucketStats.blocked}</p>
        </Link>
        <Link
          href={buildCredentialingHref({ segment: "all", q: qTrim, priority: priorityFilter, bucket: "denied" })}
          className={`${statCardBase} ${bucket === "denied" ? "border-red-400 ring-2 ring-red-200/90" : "border-red-100 bg-red-50/35"}`}
        >
          <p className={statLabel}>Denied</p>
          <p className={`${statValue} text-red-950`}>{bucketStats.denied}</p>
        </Link>
      </section>

      <div className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <form method="get" className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {!bucket && segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
          {bucket ? <input type="hidden" name="bucket" value={bucket} /> : null}
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
                href={buildCredentialingHref({ segment, q: "", priority: "", bucket })}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear search &amp; priority
              </Link>
            ) : null}
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick filter</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildCredentialingHref({ segment: "all", q: qTrim, priority: priorityFilter, bucket: "" })}
            className={!bucket && segment === "all" ? chipOn : chipOff}
          >
            All payers
          </Link>
        </div>
      </div>

      <details className="rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
          Advanced filters
          <span className="ml-2 text-xs font-normal text-slate-500">(legacy segments — clears summary bucket)</span>
        </summary>
        <div className="border-t border-slate-100 px-4 pb-4 pt-2">
          <div className="flex flex-wrap gap-2">
            {CREDENTIALING_LIST_SEGMENTS.map(({ value, label }) => (
              <Link
                key={value}
                href={buildCredentialingHref({ segment: value, q: qTrim, priority: priorityFilter, bucket: "" })}
                className={!bucket && segment === value ? chipOn : chipOff}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </details>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Priority</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildCredentialingHref({ segment, q: qTrim, priority: "", bucket })}
            className={priorityFilter === "" ? chipOn : chipOff}
          >
            All priorities
          </Link>
          <Link
            href={buildCredentialingHref({ segment, q: qTrim, priority: "high", bucket })}
            className={priChip("high")}
          >
            High only
          </Link>
          <Link
            href={buildCredentialingHref({ segment, q: qTrim, priority: "medium", bucket })}
            className={priChip("medium")}
          >
            Medium only
          </Link>
          <Link
            href={buildCredentialingHref({ segment, q: qTrim, priority: "low", bucket })}
            className={priChip("low")}
          >
            Low only
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-3 py-3">Payer</th>
              <th className="px-3 py-3">Stage</th>
              <th className="px-3 py-3">Next action</th>
              <th className="px-3 py-3">Owner</th>
              <th className="px-3 py-3">Blocker</th>
              <th className="px-3 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-slate-500">
                  {qTrim || segment !== "all" || priorityFilter || bucket ? (
                    <>
                      No rows match.{" "}
                      <Link
                        href={buildCredentialingHref({ segment: "all", q: "", priority: "", bucket: "" })}
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
                const ownerId = r.assigned_owner_user_id?.trim() ?? "";
                const ownerName = ownerId ? ownerLabels.get(ownerId) ?? "—" : "—";
                const stage = computeCredentialingPipelineStage(r);
                const blocker = computeCredentialingPipelineBlocker(r);

                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-slate-900">{r.payer_name}</td>
                    <td className="px-3 py-3">
                      <span className={credentialingPipelineStageBadgeClass(stage)} title="Pipeline stage (derived)">
                        {CREDENTIALING_PIPELINE_STAGE_LABELS[stage]}
                      </span>
                    </td>
                    <td className="max-w-[240px] px-3 py-3 text-xs text-slate-700">
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
                    <td className="max-w-[120px] px-3 py-3 text-xs text-slate-700">
                      <span className="line-clamp-2" title={ownerName}>
                        {ownerName}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={credentialingPipelineBlockerBadgeClass(blocker)}
                        title="Blocker (derived from follow-up, checklist, and queue rules)"
                      >
                        {CREDENTIALING_PIPELINE_BLOCKER_LABELS[blocker]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <Link
                        href={`/admin/credentialing/${r.id}`}
                        className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
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
