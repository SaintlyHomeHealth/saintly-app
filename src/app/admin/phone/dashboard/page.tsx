import Link from "next/link";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { ADMIN_PHONE_DISPLAY_TIMEZONE, formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { getStaffProfile, hasFullCallVisibility, isPhoneWorkspaceUser } from "@/lib/staff-profile";
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

function ymdInTz(d: Date): string {
  // Matches the SMS inbox behavior so "due today" lines up operationally.
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

function leadLabel(leadStatus: string | null | undefined): string {
  switch (leadStatus) {
    case "contacted":
      return "Contacted";
    case "scheduled":
      return "Scheduled";
    case "admitted":
      return "Admitted";
    case "not_qualified":
      return "Not qualified";
    case "unclassified":
      return "Unclassified";
    case "new_lead":
    default:
      return "New lead";
  }
}

export default async function AdminPhoneDashboardPage() {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff) || !staff.phone_access_enabled) {
    redirect("/admin/phone");
  }

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  const now = new Date();
  const nowKey = ymdInTz(now);
  const nowMs = now.getTime();

  const scopeFilter = `assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`;

  function createScopedConversationsCountQueryBase() {
    return supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("channel", "sms")
      .is("deleted_at", null);
  }

  type ScopedConversationsCountQuery = ReturnType<typeof createScopedConversationsCountQueryBase>;

  async function countScopedConversations(extra: (q: ScopedConversationsCountQuery) => void): Promise<number> {
    // Note: we keep queries explicit (instead of reusing a generic builder) to avoid subtle filter/operator issues.
    let q = createScopedConversationsCountQueryBase();

    if (!hasFull) {
      q = q.or(scopeFilter);
    }

    extra(q);

    const { count, error } = await q;
    if (error) {
      console.warn("[admin/phone/dashboard] count:", error.message);
    }
    return count ?? 0;
  }

  // Pipeline summary (from conversations.lead_status)
  const contactedCount = await countScopedConversations((q) => q.eq("lead_status", "contacted"));
  const scheduledCount = await countScopedConversations((q) => q.eq("lead_status", "scheduled"));
  const admittedCount = await countScopedConversations((q) => q.eq("lead_status", "admitted"));
  const notQualifiedCount = await countScopedConversations((q) => q.eq("lead_status", "not_qualified"));

  const newLeadCount = await countScopedConversations((q) => q.eq("lead_status", "new_lead"));

  // Follow-up summary (from follow_up_due_at / follow_up_completed_at)
  let dueCandidateRows: { follow_up_due_at: unknown; follow_up_completed_at: unknown }[] = [];
  {
    let q = supabase
      .from("conversations")
      .select("follow_up_due_at, follow_up_completed_at")
      .eq("channel", "sms")
      .is("deleted_at", null)
      .not("follow_up_due_at", "is", null)
      .is("follow_up_completed_at", null);

    if (!hasFull) {
      q = q.or(scopeFilter);
    }

    const { data, error } = await q;
    if (error) {
      console.warn("[admin/phone/dashboard] follow-up due candidates:", error.message);
    }
    dueCandidateRows = (data ?? []) as { follow_up_due_at: unknown; follow_up_completed_at: unknown }[];
  }

  let overdueFollowUps = 0;
  let dueTodayFollowUps = 0;
  let openFollowUps = 0;
  for (const r of dueCandidateRows) {
    const dueIso =
      typeof r.follow_up_due_at === "string" && r.follow_up_due_at.trim() ? r.follow_up_due_at : null;
    if (!dueIso) continue;

    const due = new Date(dueIso);
    if (Number.isNaN(due.getTime())) continue;

    if (due.getTime() < nowMs) overdueFollowUps++;
    if (ymdInTz(due) === nowKey) dueTodayFollowUps++;
    if (due.getTime() >= nowMs) openFollowUps++;
  }

  const completedFollowUps = await countScopedConversations((q) =>
    q.not("follow_up_completed_at", "is", null)
  );

  // Ownership summary
  const myAssignedCount = await (async () => {
    let q = supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("channel", "sms")
      .is("deleted_at", null)
      .eq("assigned_to_user_id", staff.user_id);

    if (!hasFull) {
      // already scoped by assigned_to_user_id, but keep explicit symmetry with other counts.
      q = q.or(scopeFilter);
    }

    const { count, error } = await q;
    if (error) console.warn("[admin/phone/dashboard] myAssignedCount:", error.message);
    return count ?? 0;
  })();

  const unassignedCount = await (async () => {
    let q = supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("channel", "sms")
      .is("deleted_at", null)
      .is("assigned_to_user_id", null);

    if (!hasFull) {
      q = q.or(scopeFilter);
    }

    const { count, error } = await q;
    if (error) console.warn("[admin/phone/dashboard] unassignedCount:", error.message);
    return count ?? 0;
  })();

  const totalInScopeCount = await (async () => {
    let q = supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("channel", "sms")
      .is("deleted_at", null);

    if (!hasFull) {
      q = q.or(scopeFilter);
    }

    const { count, error } = await q;
    if (error) console.warn("[admin/phone/dashboard] totalInScopeCount:", error.message);
    return count ?? 0;
  })();

  // Recent activity (keep it small; no timeline engine)
  const [inboundMessagesRes, updatedConversationsRes, newIntakesRes] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, body, direction, created_at")
        .eq("direction", "inbound")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) console.warn("[admin/phone/dashboard] inbound messages:", error.message);
      return (data ?? []) as Array<{
        id: unknown;
        conversation_id: unknown;
        body: unknown;
        direction: unknown;
        created_at: unknown;
      }>;
    })(),
    (async () => {
      let q = supabase
        .from("conversations")
        .select(
          "id, updated_at, lead_status, assigned_to_user_id, main_phone_e164, contacts ( full_name, first_name, last_name )"
        )
        .eq("channel", "sms")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(6);

      if (!hasFull) q = q.or(scopeFilter);

      const { data, error } = await q;
      if (error) console.warn("[admin/phone/dashboard] updated conversations:", error.message);
      return (data ?? []) as Array<{
        id: unknown;
        updated_at: unknown;
        lead_status: unknown;
        assigned_to_user_id: unknown;
        main_phone_e164: unknown;
        contacts: unknown;
      }>;
    })(),
    (async () => {
      let q = supabase
        .from("conversations")
        .select(
          "id, updated_at, lead_status, assigned_to_user_id, main_phone_e164, primary_contact_id, contacts ( full_name, first_name, last_name )"
        )
        .eq("channel", "sms")
        .is("deleted_at", null)
        .not("primary_contact_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(4);

      if (!hasFull) q = q.or(scopeFilter);

      const { data, error } = await q;
      if (error) console.warn("[admin/phone/dashboard] new intakes:", error.message);
      return (data ?? []) as Array<{
        id: unknown;
        updated_at: unknown;
        lead_status: unknown;
        assigned_to_user_id: unknown;
        main_phone_e164: unknown;
        primary_contact_id: unknown;
        contacts: unknown;
      }>;
    })(),
  ]);

  type InboundConversationLookupRow = {
    id: unknown;
    lead_status: unknown;
    assigned_to_user_id: unknown;
    main_phone_e164: unknown;
    contacts: unknown;
  };

  const inboundConversationIds = [
    ...new Set(
      inboundMessagesRes
        .map((m) => (typeof m.conversation_id === "string" ? m.conversation_id : null))
        .filter(Boolean)
    ),
  ] as string[];

  const inboundConversationsById: Record<string, InboundConversationLookupRow> = {};
  if (inboundConversationIds.length > 0) {
    let q = supabase
      .from("conversations")
      .select(
        "id, lead_status, assigned_to_user_id, main_phone_e164, contacts ( full_name, first_name, last_name )"
      )
      .eq("channel", "sms")
      .in("id", inboundConversationIds);

    if (!hasFull) q = q.or(scopeFilter);

    const { data, error } = await q;
    if (error) console.warn("[admin/phone/dashboard] inbound conversations lookup:", error.message);

    for (const c of (data ?? []) as InboundConversationLookupRow[]) {
      const cid = String(c.id);
      if (cid) inboundConversationsById[cid] = c;
    }
  }

  const assigneeIds = [
    ...new Set(
      [
        ...updatedConversationsRes.map((c) => (typeof c.assigned_to_user_id === "string" ? c.assigned_to_user_id : null)),
        ...newIntakesRes.map((c) => (typeof c.assigned_to_user_id === "string" ? c.assigned_to_user_id : null)),
        ...Object.values(inboundConversationsById).map((c) =>
          typeof c.assigned_to_user_id === "string" ? c.assigned_to_user_id : null
        ),
      ].filter(Boolean)
    ),
  ] as string[];

  let labelByUserId: Record<string, string> = {};
  if (assigneeIds.length > 0) {
    const { data: staffRows, error } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .in("user_id", assigneeIds);

    if (error) {
      console.warn("[admin/phone/dashboard] staff label lookup:", error.message);
    } else {
      labelByUserId = {};
      for (const s of staffRows ?? []) {
        const uid = typeof s.user_id === "string" ? s.user_id : "";
        if (!uid) continue;
        const em = typeof s.email === "string" ? s.email.trim() : "";
        const fn = typeof s.full_name === "string" ? s.full_name.trim() : "";
        labelByUserId[uid] = em || fn || `User ${uid.slice(0, 8)}…`;
      }
    }
  }

  function assignedLabel(userId: unknown): string {
    if (typeof userId !== "string" || !userId.trim()) return "Unassigned";
    if (staff && userId === staff.user_id) return "You";
    return labelByUserId[userId] ?? `User ${userId.slice(0, 8)}…`;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone messaging</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Command Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Operational oversight for SMS intake, assignments, and follow-ups.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/admin/phone/messages"
            className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100"
          >
            Inbox
          </Link>
          <Link
            href="/admin/phone"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Phone Calls
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Pipeline summary</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs font-semibold text-slate-600">New leads</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{newLeadCount}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Contacted</p>
            <p className="mt-1 text-2xl font-bold text-amber-950">{contactedCount}</p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs font-semibold text-sky-900">Scheduled</p>
            <p className="mt-1 text-2xl font-bold text-sky-950">{scheduledCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-900">Admitted</p>
            <p className="mt-1 text-2xl font-bold text-emerald-950">{admittedCount}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-semibold text-rose-900">Not qualified</p>
            <p className="mt-1 text-2xl font-bold text-rose-950">{notQualifiedCount}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Follow-up summary</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-semibold text-rose-900">Overdue follow-ups</p>
            <p className="mt-1 text-2xl font-bold text-rose-950">{overdueFollowUps}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Due today</p>
            <p className="mt-1 text-2xl font-bold text-amber-950">{dueTodayFollowUps}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs font-semibold text-slate-700">Open follow-ups</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{openFollowUps}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-900">Completed follow-ups</p>
            <p className="mt-1 text-2xl font-bold text-emerald-950">{completedFollowUps}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Ownership summary</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs font-semibold text-sky-900">My assigned conversations</p>
            <p className="mt-1 text-2xl font-bold text-sky-950">{myAssignedCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs font-semibold text-slate-700">Unassigned conversations</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{unassignedCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-600">Total active in scope</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalInScopeCount}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Latest inbound texts
            </h3>
            <div className="mt-2 space-y-2">
              {inboundMessagesRes.length === 0 ? (
                <p className="text-sm text-slate-500">No inbound messages yet.</p>
              ) : (
                inboundMessagesRes.slice(0, 6).map((m) => {
                  const cid = typeof m.conversation_id === "string" ? m.conversation_id : "";
                  if (!cid) return null;
                  const conv = inboundConversationsById[cid];
                  if (!conv) return null;

                  const title =
                    crmDisplayNameFromContactsRaw(conv.contacts) ||
                    (typeof conv.main_phone_e164 === "string" ? conv.main_phone_e164 : "—");

                  const body = typeof m.body === "string" ? m.body.trim() : "";
                  const snippet = body ? body.slice(0, 70) + (body.length > 70 ? "…" : "") : "—";

                  const createdAt = typeof m.created_at === "string" ? m.created_at : null;

                  return (
                    <div key={String(m.id)} className="rounded-md bg-white p-2">
                      <Link
                        href={`/admin/phone/messages/${cid}`}
                        className="block text-sm font-semibold text-sky-800 hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-600">{snippet}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{createdAt ? formatAdminPhoneWhen(createdAt) : "—"}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Latest updated conversations
            </h3>
            <div className="mt-2 space-y-2">
              {updatedConversationsRes.length === 0 ? (
                <p className="text-sm text-slate-500">No conversations yet.</p>
              ) : (
                updatedConversationsRes.slice(0, 6).map((c) => {
                  const id = typeof c.id === "string" ? c.id : "";
                  if (!id) return null;

                  const title =
                    crmDisplayNameFromContactsRaw(c.contacts) ||
                    (typeof c.main_phone_e164 === "string" ? c.main_phone_e164 : "—");

                  const updatedAt = typeof c.updated_at === "string" ? c.updated_at : null;
                  const leadStatus =
                    typeof c.lead_status === "string" ? c.lead_status : "unclassified";

                  return (
                    <div key={id} className="rounded-md bg-white p-2">
                      <Link
                        href={`/admin/phone/messages/${id}`}
                        className="block text-sm font-semibold text-sky-800 hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-600">
                        {leadLabel(leadStatus)} · {assignedLabel(c.assigned_to_user_id)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {updatedAt ? formatAdminPhoneWhen(updatedAt) : "—"}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Latest new intakes</h3>
            <div className="mt-2 space-y-2">
              {newIntakesRes.length === 0 ? (
                <p className="text-sm text-slate-500">No intakes yet.</p>
              ) : (
                newIntakesRes.slice(0, 4).map((c) => {
                  const id = typeof c.id === "string" ? c.id : "";
                  if (!id) return null;

                  const title =
                    crmDisplayNameFromContactsRaw(c.contacts) ||
                    (typeof c.main_phone_e164 === "string" ? c.main_phone_e164 : "—");

                  const updatedAt = typeof c.updated_at === "string" ? c.updated_at : null;
                  const leadStatus =
                    typeof c.lead_status === "string" ? c.lead_status : "unclassified";

                  return (
                    <div key={id} className="rounded-md bg-white p-2">
                      <Link
                        href={`/admin/phone/messages/${id}`}
                        className="block text-sm font-semibold text-sky-800 hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-600">
                        Intake · {leadLabel(leadStatus)} · {assignedLabel(c.assigned_to_user_id)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {updatedAt ? formatAdminPhoneWhen(updatedAt) : "—"}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Visibility is scoped to your phone workspace role (admin/manager can see all; nurses see unassigned + own).
      </p>
    </div>
  );
}

