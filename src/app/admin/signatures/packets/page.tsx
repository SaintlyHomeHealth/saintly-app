import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { redirect } from "next/navigation";

export default async function AdminPdfSignPacketsPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  const { data: rows } = await supabaseAdmin
    .from("signature_packets")
    .select(
      "id, status, primary_document_type, crm_entity_type, crm_entity_id, created_at, expires_at, completed_at, signature_packet_documents(id, completed_storage_bucket, completed_storage_path, completed_sha256)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">PDF sign packets</h1>
          <p className="text-sm text-slate-600">Recent signing packets (newest first).</p>
        </div>
        <Link
          href="/admin/signatures"
          className="text-sm font-semibold text-indigo-700 underline-offset-2 hover:underline"
        >
          Back
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">CRM</th>
              <th className="px-3 py-2">Download</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row) => {
              const docs = (row as { signature_packet_documents?: { id: string }[] })?.signature_packet_documents;
              const docId = docs?.[0]?.id;
              return (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-700">
                    {row.created_at ? formatAppDateTime(row.created_at) : "—"}
                  </td>
                  <td className="px-3 py-2">{row.primary_document_type}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    {row.crm_entity_type}: {row.crm_entity_id}
                  </td>
                  <td className="px-3 py-2">
                    {docId && (row.status === "completed" || row.status === "signed") ? (
                      <a
                        className="font-semibold text-indigo-700 underline-offset-2 hover:underline"
                        href={`/api/pdf-sign/admin/download?packetDocumentId=${encodeURIComponent(docId)}`}
                      >
                        Signed URL
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No packets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
