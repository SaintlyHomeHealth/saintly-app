import Link from "next/link";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { ADMIN_PHONE_DISPLAY_TIMEZONE, formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import {
  getStaffProfile,
  hasFullCallVisibility,
  isAdminOrHigher,
  isPhoneWorkspaceUser,
} from "@/lib/staff-profile";
import { countUnreadInboundByConversationIds } from "@/lib/phone/sms-inbound-unread";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContactEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

function crmDisplayNameFromContactsRaw(contactsRaw: unknown): string | null {
  let emb: ContactEmbed | null = null;
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    emb = contactsRaw as ContactEmbed;
  } else if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    emb = contactsRaw[0] as ContactEmbed;
  }
  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

function labelForUserId(
  map: Record<string, string>,
  userId: string | null | undefined
): string | null {
  if (!userId) return null;
  return map[userId] ?? `${userId.slice(0, 8)}…`;
}

function isUnknownTexterMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).unknown_texter === true;
}

function ymdInTz(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_PHONE_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPart["type"]) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminSmsInboxPage({ searchParams }: PageProps) {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff) || !staff.phone_access_enabled) {
    redirect("/admin/phone");
  }

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  const sp = (await searchParams) ?? {};
  const filterRaw = typeof sp.filter === "string" ? sp.filter.trim() : "all";
  const filter =
    filterRaw === "all" ||
    filterRaw === "mine" ||
    filterRaw === "unassigned" ||
    filterRaw === "overdue" ||
    filterRaw === "due_today" ||
    filterRaw === "new_lead" ||
    filterRaw === "contacted" ||
    filterRaw === "scheduled" ||
    filterRaw === "admitted" ||
    filterRaw === "not_qualified" ||
    filterRaw === "open_followup" ||
    filterRaw === "completed_followup"
      ? filterRaw
      : "all";

  const limit = filter === "all" ? 80 : 200;

  let q = supabase
    .from("conversations")
    .select(
      "id, main_phone_e164, last_message_at, lead_status, follow_up_due_at, follow_up_completed_at, assigned_to_user_id, assigned_at, primary_contact_id, metadata, contacts ( full_name, first_name, last_name )"
    )
    .eq("channel", "sms")
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (!hasFull) {
    q = q.or(`assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`);
  }

  const { data: convRows, error } = await q;
  if (error) {
    console.warn("[admin/phone/messages] list:", error.message);
  }

  let rows = convRows ?? [];

  const now = new Date();
  const nowKey = ymdInTz(now);

  if (filter !== "all") {
    rows = rows.filter((r) => {
      const assignedTo = r.assigned_to_user_id as string | null;
      const leadStatus =
        typeof r.lead_status === "string" && r.lead_status.trim() ? r.lead_status : "unclassified";
      const dueIso =
        typeof r.follow_up_due_at === "string" && r.follow_up_due_at.trim()
          ? r.follow_up_due_at
          : null;
      const completedAt =
        typeof r.follow_up_completed_at === "string" && r.follow_up_completed_at.trim()
          ? r.follow_up_completed_at
          : null;

      const due = dueIso ? new Date(dueIso) : null;
      const dueValid = due ? !Number.isNaN(due.getTime()) : false;

      switch (filter) {
        case "mine":
          return assignedTo === staff.user_id;
        case "unassigned":
          return assignedTo == null;
        case "overdue":
          return completedAt == null && dueValid && due!.getTime() < now.getTime();
        case "due_today":
          return completedAt == null && dueValid && ymdInTz(due!) === nowKey;
        case "open_followup":
          return completedAt == null && dueValid && due!.getTime() >= now.getTime();
        case "completed_followup":
          return completedAt != null;
        case "new_lead":
          return leadStatus === "new_lead";
        case "contacted":
          return leadStatus === "contacted";
        case "scheduled":
          return leadStatus === "scheduled";
        case "admitted":
          return leadStatus === "admitted";
        case "not_qualified":
          return leadStatus === "not_qualified";
        default:
          return true;
      }
    });
  }
  const ids = rows.map((r) => r.id as string);
  const unreadByConvId = await countUnreadInboundByConversationIds(supabase, ids);
  if (process.env.SMS_UNREAD_DEBUG === "1") {
    const withUnread = ids.filter((id) => (unreadByConvId[id] ?? 0) > 0);
    console.warn("[sms-unread-debug] admin inbox mapping", {
      rowCount: ids.length,
      conversationsWithUnread: withUnread.length,
      sampleIdsWithUnread: withUnread.slice(0, 8),
    });
  }
  const assigneeIds = [...new Set(rows.map((r) => r.assigned_to_user_id as string | null).filter(Boolean))] as string[];

  const labelByUserId: Record<string, string> = {};
  if (assigneeIds.length > 0) {
    const { data: staffRows } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .in("user_id", assigneeIds);
    for (const s of staffRows ?? []) {
      const uid = typeof s.user_id === "string" ? s.user_id : "";
      if (!uid) continue;
      const em = typeof s.email === "string" ? s.email.trim() : "";
      const fn = typeof s.full_name === "string" ? s.full_name.trim() : "";
      labelByUserId[uid] = em || fn || `User ${uid.slice(0, 8)}…`;
    }
  }

  const previewByConvId: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const seen = new Set<string>();
    for (const m of msgRows ?? []) {
      const cid = typeof m.conversation_id === "string" ? m.conversation_id : "";
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      const body = typeof m.body === "string" ? m.body.trim() : "";
      previewByConvId[cid] = body.slice(0, 120) + (body.length > 120 ? "…" : "");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SMS</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Inbox</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Inbound webhook:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/twilio/sms/inbound</code>
          </p>
        </div>
        <Link
          href="/admin/phone/dashboard"
          className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100"
        >
          Dashboard
        </Link>
        <Link
          href="/admin/phone"
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Back to Phone Calls
        </Link>
        {isAdminOrHigher(staff) ? (
          <Link
            href="/admin/phone/sms-telemetry"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            AI SMS telemetry
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        action="/admin/phone/messages"
        className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2"
      >
        <label className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter</span>
          <select
            name="filter"
            defaultValue={filter}
            className="min-w-[14rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
          >
            <option value="all">All</option>
            <option value="mine">Mine</option>
            <option value="unassigned">Unassigned</option>
            <option value="overdue">Overdue</option>
            <option value="due_today">Due today</option>
            <option value="new_lead">New leads</option>
            <option value="contacted">Contacted</option>
            <option value="scheduled">Scheduled</option>
            <option value="admitted">Admitted</option>
            <option value="not_qualified">Not qualified</option>
            <option value="open_followup">Open follow-up</option>
            <option value="completed_followup">Completed follow-up</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          {filter !== "all" ? (
            <Link
              href="/admin/phone/messages"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Clear
            </Link>
          ) : null}
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Contact / number</th>
              <th className="px-4 py-3">Preview</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No conversations yet. Send a test SMS to your Twilio number after configuring the webhook.
                </td>
              </tr>
            ) : (
              rows.map((raw) => {
                const id = String(raw.id);
                const phone = typeof raw.main_phone_e164 === "string" ? raw.main_phone_e164 : "—";
                const crm = crmDisplayNameFromContactsRaw(raw.contacts);
                const unknown = isUnknownTexterMetadata(raw.metadata) && !raw.primary_contact_id;
                const title = crm
                  ? `${crm} · ${phone}`
                  : unknown
                    ? `Unknown · ${phone}`
                    : phone;
                const leadStatus =
                  typeof raw.lead_status === "string" && raw.lead_status.trim() ? raw.lead_status : "unclassified";
                const dueIso =
                  typeof raw.follow_up_due_at === "string" && raw.follow_up_due_at.trim()
                    ? raw.follow_up_due_at
                    : null;
                const completedAt =
                  typeof raw.follow_up_completed_at === "string" && raw.follow_up_completed_at.trim()
                    ? raw.follow_up_completed_at
                    : null;
                const now = new Date();
                const nowKey = ymdInTz(now);
                const leadBadge = (() => {
                  switch (leadStatus) {
                    case "contacted":
                      return (
                        <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          Contacted
                        </span>
                      );
                    case "scheduled":
                      return (
                        <span className="ml-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                          Scheduled
                        </span>
                      );
                    case "admitted":
                      return (
                        <span className="ml-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                          Admitted
                        </span>
                      );
                    case "not_qualified":
                      return (
                        <span className="ml-2 inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
                          Not qualified
                        </span>
                      );
                    case "unclassified":
                      return (
                        <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          Unclassified
                        </span>
                      );
                    case "new_lead":
                    default:
                      return (
                        <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          New
                        </span>
                      );
                  }
                })();

                const followBadge = (() => {
                  if (completedAt) return null;

                  if (dueIso) {
                    const due = new Date(dueIso);
                    if (Number.isNaN(due.getTime())) return null;
                    if (due.getTime() < now.getTime()) {
                      return (
                        <span className="ml-2 inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
                          Overdue
                        </span>
                      );
                    }
                    if (ymdInTz(due) === nowKey) {
                      return (
                        <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          Due today
                        </span>
                      );
                    }
                    return (
                      <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        Open follow-up
                      </span>
                    );
                  }

                  return (
                    <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      Open follow-up
                    </span>
                  );
                })();
                const aid = raw.assigned_to_user_id as string | null;
                const unreadCount = unreadByConvId[id] ?? 0;
                const hasUnread = unreadCount > 0;
                return (
                  <tr key={id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/phone/messages/${id}`}
                        className={`inline-flex items-start gap-2 underline-offset-2 hover:underline ${
                          hasUnread ? "font-semibold text-slate-900" : "font-medium text-sky-800"
                        }`}
                      >
                        {hasUnread ? (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500 shadow-sm shadow-sky-900/10 ring-1 ring-sky-400/40"
                            aria-hidden
                          />
                        ) : null}
                        <span>
                          {title}
                          {leadBadge}
                          {followBadge}
                        </span>
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                      {previewByConvId[id] || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatAdminPhoneWhen(
                        typeof raw.last_message_at === "string" ? raw.last_message_at : null
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {labelForUserId(labelByUserId, aid) ?? "—"}
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
