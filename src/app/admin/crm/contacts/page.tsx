import Link from "next/link";
import { redirect } from "next/navigation";

import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminCrmContactsPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const supabase = await createServerSupabaseClient();
  const { data: rows, error } = await supabase
    .from("contacts")
    .select(
      "id, full_name, first_name, last_name, primary_phone, secondary_phone, email, contact_type, status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const list = (rows ?? []) as {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    primary_phone: string | null;
    secondary_phone: string | null;
    email: string | null;
    contact_type: string | null;
    status: string | null;
    created_at: string;
  }[];

  return (
    <div className="space-y-6 p-6">
      <nav className="flex flex-wrap gap-3 text-sm font-semibold text-sky-800">
        <Link href="/admin" className="underline-offset-2 hover:underline">
          Admin
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-900">Contacts</span>
        <Link href="/admin/crm/leads" className="underline-offset-2 hover:underline">
          Leads
        </Link>
        <Link href="/admin/crm/patients" className="underline-offset-2 hover:underline">
          Patients
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/dispatch" className="underline-offset-2 hover:underline">
          Dispatch
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/roster" className="underline-offset-2 hover:underline">
          Roster
        </Link>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">CRM · Contacts</h1>
        <p className="mt-1 text-sm text-slate-600">Master people records (newest 100).</p>
        {error ? <p className="mt-2 text-sm text-red-700">{error.message}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Primary phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-slate-500">
                  No contacts yet.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-800">
                    {r.full_name?.trim() ||
                      [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
                      "—"}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-slate-700">
                    {formatPhoneForDisplay(r.primary_phone)}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-slate-700">{r.email ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.contact_type ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.status ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
