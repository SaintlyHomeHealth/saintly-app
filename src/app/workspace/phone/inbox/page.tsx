import Link from "next/link";
import { redirect } from "next/navigation";
import { InboxIcon, MessageSquare } from "lucide-react";

import { SmsConversationDetail } from "@/app/admin/phone/messages/_components/SmsConversationDetail";

import { InboxScrollRestorer } from "./_components/InboxScrollRestorer";
import { InboxSearchBar } from "./_components/InboxSearchBar";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { labelForContactType } from "@/lib/crm/contact-types";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
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

function unreadCountFromMetadata(raw: unknown): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const v = (raw as Record<string, unknown>).unread_count;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
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

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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
  const previewByConvId: Record<string, string> = {};
  if (ids.length > 0) {
    const previewRowCap = Math.min(500, Math.max(120, ids.length * 8));
    const { data: msgRows } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", ids)
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
    <div className="ws-phone-page-shell flex min-h-0 flex-1 flex-col lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-sky-100/60 pb-28 pt-5 sm:pb-32 lg:w-[240px] lg:shrink-0 lg:border-r lg:border-slate-200 lg:bg-white lg:pb-0 lg:pt-0">
          <div className="shrink-0 px-4 sm:px-5 lg:border-b lg:border-slate-200/90 lg:bg-white lg:px-3 lg:py-1 lg:shadow-[0_1px_0_0_rgb(248_250_252)]">
            <WorkspacePhonePageHeader
              title="Inbox"
              subtitle="Tap a conversation to open the thread — same flow as Messages."
              className="mb-4 gap-2 sm:gap-3 lg:mb-0 lg:gap-0.5 [&_h1]:lg:text-sm [&_h1]:lg:font-semibold [&>div>p]:lg:hidden"
              actions={
                <div className="flex w-full flex-col gap-2 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-end lg:gap-1.5">
                  <Link
                    href="/workspace/phone/inbox/new"
                    className="inline-flex min-h-[2.25rem] shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-950 to-sky-600 px-3.5 py-2 text-center text-xs font-semibold text-white shadow-md shadow-blue-900/20 hover:brightness-105 lg:min-h-0 lg:w-full lg:rounded-md lg:px-3 lg:py-1.5 lg:text-[11px] lg:shadow-none"
                  >
                    New message
                  </Link>
                  <InboxSearchBar
                    defaultQuery={qRaw}
                    preserveThreadId={selectedThreadValid ? threadRaw : undefined}
                    className="lg:w-full"
                  />
                </div>
              }
            />
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col lg:min-h-0">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] hidden h-5 bg-gradient-to-b from-white from-40% to-transparent lg:block"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] hidden h-6 bg-gradient-to-t from-white from-35% to-transparent lg:block"
              aria-hidden
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain lg:relative lg:z-0">
              <InboxScrollRestorer>
            <section className="mx-4 mt-3 overflow-hidden rounded-2xl border border-sky-100/70 bg-white shadow-md shadow-sky-950/5 sm:mx-5 lg:mx-0 lg:mt-0 lg:rounded-none lg:border-0 lg:border-t lg:border-slate-200/80 lg:bg-white lg:shadow-none">
              <ul className="divide-y divide-sky-100/60 lg:divide-slate-100">
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
                    const unreadCount = unreadCountFromMetadata((r as { metadata?: unknown }).metadata);
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
                    const baseRow = unreadCount > 0 ? "bg-white hover:bg-sky-50/40" : "hover:bg-phone-powder/50";
                    const selectedRing = rowSelected
                      ? "border-l-4 border-l-sky-600 bg-sky-50"
                      : "border-l-4 border-l-transparent";

                    const primaryLabel = name ?? phoneDisplay;
                    const hasUnread = unreadCount > 0;

                    const rowContentMobile = (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`truncate font-semibold ${hasUnread ? "text-phone-navy" : "text-slate-900"}`}
                          >
                            {primaryLabel}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-500">{when}</span>
                        </div>
                        {name ? <p className="truncate text-xs text-slate-500">{phoneDisplay}</p> : null}
                        {preview ? (
                          <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-slate-600">{preview}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {hasUnread ? (
                            <span className="inline-flex rounded-full bg-gradient-to-r from-blue-950 to-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm shadow-blue-900/20">
                              {unreadCount} new
                            </span>
                          ) : null}
                          <span className="inline-flex rounded-full border border-sky-200/80 bg-phone-ice/90 px-2 py-0.5 text-[10px] font-semibold text-phone-ink">
                            {entity}
                          </span>
                        </div>
                      </>
                    );

                    const desktopRowChrome = rowSelected
                      ? "border-l-sky-500 bg-gradient-to-r from-sky-50/95 via-sky-50/50 to-transparent hover:from-sky-100/85 hover:via-sky-50/70"
                      : "border-l-transparent hover:bg-slate-50/95";

                    const desktopLabelClass = rowSelected
                      ? hasUnread
                        ? "font-bold text-slate-950 text-[15px] leading-tight tracking-tight"
                        : "font-semibold text-slate-900 text-[15px] leading-tight tracking-tight"
                      : hasUnread
                        ? "font-semibold text-slate-900 text-sm leading-snug tracking-tight"
                        : "font-medium text-slate-600 text-sm leading-snug";

                    return (
                      <li key={id}>
                        <Link
                          href={inboxMobileUrl(id, qRaw)}
                          className={`block px-4 py-3.5 transition active:bg-phone-ice/70 lg:hidden ${baseRow} ${selectedRing}`}
                        >
                          {rowContentMobile}
                        </Link>
                        <Link
                          href={inboxDesktopUrl(id, qRaw)}
                          scroll={false}
                          className={`hidden items-center gap-2 border-l-[3px] px-3 py-2 transition-colors active:bg-slate-100/70 lg:flex ${desktopRowChrome} ${desktopLabelClass}`}
                        >
                          <span className="min-w-0 flex-1 truncate">{primaryLabel}</span>
                          {hasUnread ? (
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600 shadow-[0_0_0_1px_rgba(255,255,255,0.95)] ring-2 ring-sky-500/35"
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

        <div className="hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white lg:flex">
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
