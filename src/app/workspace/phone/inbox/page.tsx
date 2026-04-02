import Link from "next/link";
import { redirect } from "next/navigation";
import { InboxIcon, MessageCircleMore } from "lucide-react";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { canAccessWorkspacePhone, getStaffProfile, hasFullCallVisibility } from "@/lib/staff-profile";
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

function leadChipLabel(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "Unclassified";
  if (v === "new_lead") return "New lead";
  return v.replace(/_/g, " ");
}

function unreadCountFromMetadata(raw: unknown): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const v = (raw as Record<string, unknown>).unread_count;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspaceInboxPage({ searchParams }: PageProps) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const sp = (await searchParams) ?? {};
  const qRaw = typeof sp.q === "string" ? sp.q.trim() : "";
  const selectedRaw = typeof sp.selected === "string" ? sp.selected.trim() : "";

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  let q = supabase
    .from("conversations")
    .select(
      "id, main_phone_e164, last_message_at, lead_status, assigned_to_user_id, primary_contact_id, metadata, contacts ( full_name, first_name, last_name )"
    )
    .eq("channel", "sms")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (!hasFull) {
    q = q.or(`assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`);
  }

  const { data: convRows, error } = await q;
  if (error) {
    console.warn("[workspace/phone/inbox] list:", error.message);
  }

  let rows = convRows ?? [];
  if (qRaw) {
    const q = qRaw.toLowerCase();
    rows = rows.filter((r) => {
      const phone = typeof r.main_phone_e164 === "string" ? r.main_phone_e164.toLowerCase() : "";
      const name = (crmDisplayNameFromContactsRaw(r.contacts) ?? "").toLowerCase();
      return phone.includes(q) || name.includes(q);
    });
  }
  const ids = rows.map((r) => r.id as string);
  const previewByConvId: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("conversation_id, body, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });

    const seen = new Set<string>();
    for (const m of msgRows ?? []) {
      const cid = typeof m.conversation_id === "string" ? m.conversation_id : "";
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      const body = typeof m.body === "string" ? m.body.trim() : "";
      previewByConvId[cid] = body.slice(0, 100) + (body.length > 100 ? "…" : "");
    }
  }

  const selectedId = selectedRaw && rows.some((r) => String(r.id) === selectedRaw) ? selectedRaw : ids[0] ?? null;
  const selectedRow = rows.find((r) => String(r.id) === selectedId) ?? null;
  const selectedName = selectedRow ? crmDisplayNameFromContactsRaw(selectedRow.contacts) : null;
  const selectedPhone =
    selectedRow && typeof selectedRow.main_phone_e164 === "string" && selectedRow.main_phone_e164.trim()
      ? selectedRow.main_phone_e164
      : "—";
  const selectedPreview = selectedId ? previewByConvId[selectedId] ?? "" : "";

  return (
    <div className="px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Inbox"
        subtitle="SMS threads assigned to you or open for the team."
        actions={
          <form method="get" action="/workspace/phone/inbox" className="w-full min-[400px]:w-52 sm:w-60">
            <input
              name="q"
              defaultValue={qRaw}
              placeholder="Search name or number"
              className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm shadow-slate-200/50 outline-none ring-sky-200 transition focus:ring"
            />
          </form>
        }
      />

      <div className="mt-2 grid gap-4 lg:grid-cols-[minmax(300px,1fr)_minmax(280px,0.85fr)] xl:grid-cols-[minmax(340px,1fr)_minmax(320px,0.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md shadow-slate-200/45">
          <ul className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <li className="px-4 py-10 text-center">
                <InboxIcon className="mx-auto h-5 w-5 text-slate-400" strokeWidth={2} />
                <p className="mt-2 text-sm text-slate-500">No conversations yet.</p>
                <Link
                  href="/workspace/phone/calls"
                  className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
                const name = crmDisplayNameFromContactsRaw(r.contacts);
                const when = formatAdminPhoneWhen(
                  typeof r.last_message_at === "string" ? r.last_message_at : null
                );
                const preview = previewByConvId[id] ?? "";
                const chip = leadChipLabel((r as { lead_status?: unknown }).lead_status);
                const isSelected = id === selectedId;
                const unreadCount = unreadCountFromMetadata((r as { metadata?: unknown }).metadata);
                return (
                  <li key={id}>
                    <Link
                      href={`/workspace/phone/inbox?${new URLSearchParams({ selected: id, ...(qRaw ? { q: qRaw } : {}) }).toString()}`}
                      className={`block px-4 py-3 transition ${
                        isSelected
                          ? "bg-sky-50/70 ring-1 ring-inset ring-sky-200"
                          : unreadCount > 0
                            ? "bg-white hover:bg-sky-50/30 active:bg-slate-100"
                            : "hover:bg-slate-50 active:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`truncate font-semibold ${unreadCount > 0 ? "text-slate-950" : "text-slate-900"}`}>
                          {name ?? phone}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-500">{when}</span>
                      </div>
                      {name ? <p className="truncate text-xs text-slate-500">{phone}</p> : null}
                      {preview ? <p className="mt-1.5 line-clamp-1 text-xs text-slate-600">{preview}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {unreadCount > 0 ? (
                          <span className="inline-flex rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {unreadCount} unread
                          </span>
                        ) : null}
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-600">
                          {chip}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <aside className="space-y-3">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-200/45">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected thread</p>
            {selectedRow ? (
              <>
                <p className="mt-1 truncate text-base font-semibold text-slate-900">{selectedName ?? selectedPhone}</p>
                <p className="font-mono text-xs text-slate-500">{selectedPhone}</p>
                {selectedPreview ? <p className="mt-2 line-clamp-4 text-sm text-slate-600">{selectedPreview}</p> : null}
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/workspace/phone/inbox/${selectedId}`}
                    className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Open thread
                  </Link>
                  <Link
                    href="/workspace/phone/keypad"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Call
                  </Link>
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-slate-500">
                <MessageCircleMore className="mb-2 h-5 w-5 text-slate-400" strokeWidth={2} />
                Select a conversation to preview.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick routing</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <Link href="/workspace/phone/calls" className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                Calls
              </Link>
              <Link href="/workspace/phone/tasks" className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                Tasks
              </Link>
              <Link href="/workspace/phone/patients" className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                Patients
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
