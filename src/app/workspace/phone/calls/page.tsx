import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { SoftphoneDialer } from "@/components/softphone/SoftphoneDialer";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { canAccessWorkspacePhone, getStaffProfile, hasFullCallVisibility } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContactNameEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

function crmDisplayNameFromContactsRaw(contactsRaw: unknown): string | null {
  let emb: ContactNameEmbed | null = null;
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    emb = contactsRaw as ContactNameEmbed;
  } else if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    emb = contactsRaw[0] as ContactNameEmbed;
  }
  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

export default async function WorkspaceCallsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  let q = supabase
    .from("phone_calls")
    .select(
      "id, created_at, direction, from_e164, to_e164, status, contacts ( full_name, first_name, last_name )"
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (!hasFull) {
    q = q.or(`assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`);
  }

  const { data: rows, error } = await q;

  if (error) {
    console.warn("[workspace/phone/calls] list:", error.message);
  }

  const list = rows ?? [];

  const staffDisplayName =
    staff.full_name?.trim() ||
    staff.email?.trim() ||
    `${staff.role.replace(/_/g, " ")} (${staff.user_id.slice(0, 8)}…)`;

  return (
    <div className="flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader title="Calls" subtitle="Softphone and your recent call activity in one place." />

      <div className="mt-2 rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm shadow-slate-200/60 sm:p-5">
        <SoftphoneDialer staffDisplayName={staffDisplayName} />
      </div>

      <h2 className="mt-8 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Recent calls</h2>
      <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
        {list.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">No calls yet.</li>
        ) : (
          list.map((r) => {
            const id = String(r.id);
            const dir = String(r.direction ?? "").toLowerCase();
            const from = typeof r.from_e164 === "string" ? r.from_e164 : "—";
            const to = typeof r.to_e164 === "string" ? r.to_e164 : "—";
            const label = crmDisplayNameFromContactsRaw((r as { contacts?: unknown }).contacts);
            const when = formatAdminPhoneWhen(typeof r.created_at === "string" ? r.created_at : null);
            const status = String(r.status ?? "").toLowerCase();
            const missed = status === "missed";
            return (
              <li key={id}>
                <Link
                  href={`/admin/phone/${id}`}
                  className={`block px-4 py-3 transition active:bg-slate-100 ${missed ? "bg-rose-50/40 hover:bg-rose-50/60" : "hover:bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`truncate font-semibold ${missed ? "text-rose-900" : "text-slate-900"}`}>{label ?? from}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${missed ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-slate-600">
                    {dir === "inbound" ? from : to}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {when} · {dir || "—"}
                  </p>
                </Link>
              </li>
            );
          })
        )}
      </ul>
      <p className="mt-3 text-center text-[11px] text-slate-500">
        Org-wide call log &amp; missed-call recovery:{" "}
        <Link href="/admin/phone" className="font-semibold text-sky-800 underline">
          Admin call log
        </Link>
        .
      </p>
    </div>
  );
}
