import Link from "next/link";
import { redirect } from "next/navigation";
import { InboxIcon, MessageSquare, SquarePen } from "lucide-react";

import { SmsConversationDetail } from "@/app/admin/phone/messages/_components/SmsConversationDetail";

import { InboxScrollRestorer } from "./_components/InboxScrollRestorer";
import { InboxSearchBar } from "./_components/InboxSearchBar";
import { InboxThreadMobileRouteClient } from "./_components/InboxThreadMobileRouteClient";
import { WorkspaceInboxLiveClient } from "./_components/WorkspaceInboxLiveClient";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { labelForContactType } from "@/lib/crm/contact-types";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { countUnreadInboundByConversationIds } from "@/lib/phone/sms-inbound-unread";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
} from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const INBOX_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function inboxDesktopUrl(conversationId: string, q: string): string {
  const p = new URLSearchParams();
  p.set("thread", conversationId);
  if (q) p.set("q", q);
  return `/workspace/phone/inbox?${p.toString()}`;
}

function inboxMobileUrl(conversationId: string, q: string): string {
  if (q) return `/workspace/phone/inbox/${conversationId}?${new URLSearchParams({ q }).toString()}`;
  return `/workspace/phone/inbox/${conversationId}`;
}

type ContactEmbed = {
  id?: unknown;
  full_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  primary_phone?: unknown;
  contact_type?: unknown;
  email?: unknown;
};

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

function normalizeContact(contactsRaw: unknown): ContactEmbed | null {
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    return contactsRaw as ContactEmbed;
  }
  if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    return contactsRaw[0] as ContactEmbed;
  }
  return null;
}

function entityLabel(input: {
  metadata: unknown;
  primaryContactId: string | null;
  contact: ContactEmbed | null;
  leadId: string | null;
  patientId: string | null;
}): string {
  const meta = input.metadata;
  const unknownTexter =
    meta &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    (meta as Record<string, unknown>).unknown_texter === true;
  if (!input.primaryContactId && unknownTexter) return "Unknown";
  if (input.patientId) return "Patient";
  if (input.leadId) return "Lead";
  const ct = input.contact?.contact_type;
  if (typeof ct === "string" && ct.trim()) {
    const lab = labelForContactType(ct);
    if (lab !== "—") return lab;
  }
  return input.primaryContactId ? "Contact" : "Unknown";
}

function rowInitials(name: string | null, phoneDisplay: string): string {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]?.[0];
      const b = parts[parts.length - 1]?.[0];
      if (a && b) return `${a}${b}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const d = phoneDisplay.replace(/\D/g, "");
  return d.slice(-2) || "?";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Fresh unread counts and list data on each request (avoid stale RSC cache for SMS inbox). */
export const dynamic = "force-dynamic";

export default async function WorkspaceInboxPage(props: PageProps) {
  const { searchParams } = props;
  const perfStart = routePerfStart();
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const sp = (await searchParams) ?? {};
  const qRaw = typeof sp.q === "string" ? sp.q.trim() : "";
  const threadRaw = typeof sp.thread === "string" ? sp.thread.trim() : "";
  const selectedThreadValid = INBOX_UUID_RE.test(threadRaw);

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  let q = supabase
    .from("conversations")
    .select(
      "id, main_phone_e164, last_message_at, lead_status, assigned_to_user_id, primary_contact_id, metadata, next_action, follow_up_due_at, follow_up_completed_at, contacts ( id, full_name, first_name, last_name, primary_phone, contact_type, email )"
    )
    .eq("channel", "sms")
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (!hasFull) {
    q = q.or(`assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`);
  }

  const { data: convRows, error } = await q;
  if (error && process.env.NODE_ENV === "development") {
    console.warn("[workspace/phone/inbox] list:", error.message);
  }

  let rows = convRows ?? [];
  if (qRaw) {
    const ql = qRaw.toLowerCase();
    rows = rows.filter((r) => {
      const phone = typeof r.main_phone_e164 === "string" ? r.main_phone_e164.toLowerCase() : "";
      const name = (crmDisplayNameFromContactsRaw(r.contacts) ?? "").toLowerCase();
      return phone.includes(ql) || name.includes(ql);
    });
  }

  const ids = rows.map((r) => r.id as string);
  const unreadByConvId = await countUnreadInboundByConversationIds(supabase, ids);
  if (process.env.SMS_UNREAD_DEBUG === "1") {
    const withUnread = ids.filter((id) => (unreadByConvId[id] ?? 0) > 0);
    console.warn("[sms-unread-debug] workspace inbox mapping", {
      rowCount: ids.length,
      conversationsWithUnread: withUnread.length,
      sampleIdsWithUnread: withUnread.slice(0, 8),
    });
  }
  const previewByConvId: Record<string, string> = {};
  if (ids.length > 0) {
    const previewRowCap = Math.min(500, Math.max(120, ids.length * 8));
    const { data: msgRows } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(previewRowCap);

    const seen = new Set<string>();
    for (const m of msgRows ?? []) {
      const cid = typeof m.conversation_id === "string" ? m.conversation_id : "";
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      const body = typeof m.body === "string" ? m.body.trim() : "";
      previewByConvId[cid] = body.slice(0, 100) + (body.length > 100 ? "…" : "");
    }
  }

  const contactIds = [
    ...new Set(
      rows
        .map((r) => {
          const pc = (r as { primary_contact_id?: unknown }).primary_contact_id;
          return pc != null && String(pc).trim() !== "" ? String(pc).trim() : null;
        })
        .filter((x): x is string => Boolean(x))
    ),
  ];

  const leadByContactId = new Map<string, { id: string; status: string | null }>();
  const patientByContactId = new Map<string, string>();

  if (contactIds.length > 0) {
    const [leadsRes, patientsRes] = await Promise.all([
      leadRowsActiveOnly(
        supabase.from("leads").select("id, contact_id, status").in("contact_id", contactIds)
      ),
      supabase.from("patients").select("id, contact_id").in("contact_id", contactIds),
    ]);
    if (leadsRes.error && process.env.NODE_ENV === "development") {
      console.warn("[workspace/phone/inbox] leads lookup:", leadsRes.error.message);
    }
    if (patientsRes.error && process.env.NODE_ENV === "development") {
      console.warn("[workspace/phone/inbox] patients lookup:", patientsRes.error.message);
    }
    for (const row of leadsRes.data ?? []) {
      const cid = typeof row.contact_id === "string" ? row.contact_id : "";
      const lid = typeof row.id === "string" ? row.id : "";
      if (cid && lid && !leadByContactId.has(cid)) {
        leadByContactId.set(cid, { id: lid, status: typeof row.status === "string" ? row.status : null });
      }
    }
    for (const row of patientsRes.data ?? []) {
      const cid = typeof row.contact_id === "string" ? row.contact_id : "";
      const pid = typeof row.id === "string" ? row.id : "";
      if (cid && pid) patientByContactId.set(cid, pid);
    }
  }

  if (perfStart) {
    routePerfLog("workspace/phone/inbox", perfStart);
  }

  const inboxListBackHref = qRaw
    ? `/workspace/phone/inbox?${new URLSearchParams({ q: qRaw }).toString()}`
    : "/workspace/phone/inbox";

  return (
    <div className="ws-phone-page-shell flex h-full min-h-0 flex-1 flex-col lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <WorkspaceInboxLiveClient />
      <InboxThreadMobileRouteClient />
      <div className="flex min-h-0 flex-1 flex-col lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-sky-100/60 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-2 sm:pb-32 sm:pt-5 lg:w-[176px] lg:max-w-[176px] lg:flex-none lg:basis-[176px] lg:grow-0 lg:shrink-0 lg:border-r lg:border-slate-200/60 lg:bg-slate-50 lg:pb-0 lg:pt-0">
          <div className="shrink-0 px-3 sm:px-5 lg:border-b lg:border-slate-200/50 lg:bg-slate-50 lg:px-2 lg:py-2 lg:shadow-[0_1px_0_0_rgba(241,245,249,0.9)]">
            <div className="lg:hidden">
              <div className="sticky top-0 z-10 -mx-3 border-b border-sky-100/70 bg-white/95 px-3 pb-2 pt-1 shadow-[0_4px_12px_-8px_rgba(30,58,138,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-white/92">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 pt-0.5">
                    <h1 className="text-lg font-semibold tracking-tight text-phone-navy">Inbox</h1>
                    <p className="text-[11px] text-slate-500">Tap a thread to open</p>
                  </div>
                  <Link
                    href="/workspace/phone/inbox/new"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-950 to-sky-600 text-white shadow-md shadow-blue-900/25 transition hover:brightness-105"
                    title="New message"
                    aria-label="New message"
                  >
                    <SquarePen className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </Link>
                </div>
                <div className="mt-2">
                  <InboxSearchBar defaultQuery={qRaw} preserveThreadId={selectedThreadValid ? threadRaw : undefined} />
                </div>
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Inbox</p>
              <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                <Link
                  href="/workspace/phone/inbox/new"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200/70 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  title="New message"
                  aria-label="New message"
                >
                  <SquarePen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </Link>
                <InboxSearchBar
                  variant="rail"
                  defaultQuery={qRaw}
                  preserveThreadId={selectedThreadValid ? threadRaw : undefined}
                />
              </div>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col lg:min-h-0">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] hidden h-5 bg-gradient-to-b from-slate-50 from-40% to-transparent lg:block"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] hidden h-6 bg-gradient-to-t from-slate-50 from-35% to-transparent lg:block"
              aria-hidden
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain lg:relative lg:z-0">
              <InboxScrollRestorer>
            <section className="mx-0 mt-0 min-h-full overflow-hidden border-0 bg-white sm:mx-5 sm:mt-2 sm:rounded-xl sm:border sm:border-slate-200/80 lg:mx-0 lg:mt-0 lg:min-h-0 lg:rounded-none lg:border-0 lg:border-t lg:border-slate-200/55 lg:bg-slate-50">
              <ul className="divide-y divide-slate-200/55 sm:divide-sky-100/60 lg:divide-slate-100/70">
                {rows.length === 0 ? (
                  <li className="px-4 py-10 text-center">
                    <InboxIcon className="mx-auto h-5 w-5 text-slate-400" strokeWidth={2} />
                    <p className="mt-2 text-sm text-slate-500">No conversations yet.</p>
                    <Link
                      href="/workspace/phone/calls"
                      className="mt-3 inline-flex rounded-full border border-sky-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-phone-ink hover:bg-phone-ice"
                    >
                      Open calls
                    </Link>
                  </li>
                ) : (
                  rows.map((r) => {
                    const id = String(r.id);
                    const phone =
                      typeof r.main_phone_e164 === "string" && r.main_phone_e164.trim()
                        ? r.main_phone_e164
                        : "—";
                    const phoneDisplay = phone !== "—" ? formatPhoneForDisplay(phone) : phone;
                    const name = crmDisplayNameFromContactsRaw(r.contacts);
                    const when = formatAdminPhoneWhen(
                      typeof r.last_message_at === "string" ? r.last_message_at : null
                    );
                    const preview = previewByConvId[id] ?? "";
                    const unreadCount = unreadByConvId[id] ?? 0;
                    const pc =
                      (r as { primary_contact_id?: unknown }).primary_contact_id != null &&
                      String((r as { primary_contact_id?: unknown }).primary_contact_id).trim() !== ""
                        ? String((r as { primary_contact_id?: unknown }).primary_contact_id)
                        : null;
                    const c = normalizeContact(r.contacts);
                    const lid = pc && leadByContactId.has(pc) ? leadByContactId.get(pc)!.id : null;
                    const pid = pc && patientByContactId.has(pc) ? patientByContactId.get(pc)! : null;
                    const entity = entityLabel({
                      metadata: (r as { metadata?: unknown }).metadata,
                      primaryContactId: pc,
                      contact: c,
                      leadId: lid,
                      patientId: pid,
                    });

                    const rowSelected = selectedThreadValid && threadRaw === id;
                    const hasUnread = unreadCount > 0;

                    /** One background + border so selected vs unread never fight (Tailwind merge order). */
                    const mobileRowSurface = rowSelected
                      ? "border-l-4 border-l-sky-600 bg-sky-50 hover:bg-sky-50"
                      : hasUnread
                        ? "border-l-4 border-l-transparent bg-white hover:bg-sky-50/40"
                        : "border-l-4 border-l-transparent hover:bg-phone-powder/50";

                    const primaryLabel = name ?? phoneDisplay;
                    const initials = rowInitials(name, phoneDisplay);

                    const rowContentMobile = (
                      <div className="flex gap-2.5">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                            hasUnread
                              ? "bg-sky-600 text-white ring-2 ring-sky-200/80"
                              : "bg-sky-100/90 text-sky-950 ring-1 ring-sky-200/50"
                          }`}
                          aria-hidden
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`min-w-0 truncate font-semibold leading-snug ${hasUnread ? "text-phone-navy" : "text-slate-900"}`}
                            >
                              {primaryLabel}
                            </p>
                            <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-slate-400">{when}</span>
                          </div>
                          {name ? <p className="truncate font-mono text-[11px] text-slate-500">{phoneDisplay}</p> : null}
                          {preview ? (
                            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-slate-700">{preview}</p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {hasUnread ? (
                              <span className="inline-flex min-w-0 rounded-full bg-sky-600 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                                {unreadCount}
                              </span>
                            ) : null}
                            <span className="inline-flex max-w-full rounded-full border border-slate-200/90 bg-white/80 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                              {entity}
                            </span>
                          </div>
                        </div>
                      </div>
                    );

                    const desktopRowChrome =
                      rowSelected && hasUnread
                        ? "border-l-sky-600 bg-sky-50 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18)] hover:bg-sky-50"
                        : rowSelected
                          ? "border-l-sky-600 bg-sky-50 hover:bg-sky-50/95"
                          : hasUnread
                            ? "border-l-transparent bg-white hover:bg-sky-50/50"
                            : "border-l-transparent hover:bg-slate-100/90";

                    const desktopLabelClass =
                      hasUnread && rowSelected
                        ? "font-semibold text-phone-navy"
                        : hasUnread
                          ? "font-semibold text-slate-900"
                          : rowSelected
                            ? "font-semibold text-slate-900"
                            : "font-medium text-slate-600";

                    const unreadDotClass =
                      rowSelected && hasUnread
                        ? "mb-px h-2 w-2 shrink-0 self-center rounded-full bg-sky-600 shadow-sm ring-2 ring-white/90"
                        : "mb-px h-2 w-2 shrink-0 self-center rounded-full bg-sky-500 shadow-sm shadow-sky-900/10 ring-1 ring-sky-400/40";

                    return (
                      <li key={id}>
                        <Link
                          href={inboxMobileUrl(id, qRaw)}
                          className={`block px-3 py-2 transition active:bg-phone-ice/70 sm:px-4 sm:py-2.5 lg:hidden ${mobileRowSurface}`}
                        >
                          {rowContentMobile}
                        </Link>
                        <Link
                          href={inboxDesktopUrl(id, qRaw)}
                          scroll={false}
                          className={`hidden cursor-pointer items-center gap-1.5 border-l-4 px-2.5 py-1.5 text-sm leading-snug transition-colors active:bg-slate-200/50 lg:flex ${desktopRowChrome}`}
                        >
                          <span className={`min-w-0 flex-1 truncate text-sm ${desktopLabelClass}`}>
                            {primaryLabel}
                          </span>
                          {hasUnread ? (
                            <span
                              className={unreadDotClass}
                              aria-label={`${unreadCount} unread`}
                            />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
              </InboxScrollRestorer>
            </div>
          </div>
        </div>

        <div className="hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white lg:flex lg:basis-0 lg:min-w-0">
          {selectedThreadValid ? (
            <SmsConversationDetail
              params={Promise.resolve({ conversationId: threadRaw })}
              searchParams={searchParams}
              inboxHref={inboxListBackHref}
              accessDeniedHref="/admin/phone"
              workspaceShell
              workspaceDesktopSplit
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center lg:border-l lg:border-slate-200/80">
              <MessageSquare className="mx-auto h-9 w-9 text-slate-300" strokeWidth={1.5} aria-hidden />
              <p className="text-sm font-semibold text-slate-700">Select a conversation</p>
              <p className="max-w-xs text-xs leading-relaxed text-slate-500">
                Pick a thread from the list to read and reply here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
