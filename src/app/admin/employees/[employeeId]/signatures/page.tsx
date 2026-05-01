import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";
import { redirect } from "next/navigation";

import { EmployeePdfSignActions } from "./EmployeePdfSignActions";

export default async function EmployeePdfSignPage({
  params,
}: {
  params: Promise<{ employeeId?: string; id?: string }>;
}) {
  const resolved = await params;
  const applicantId = resolved.employeeId || resolved.id;
  if (!applicantId) redirect("/admin/employees");

  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  const { data: applicant } = await supabaseAdmin
    .from("applicants")
    .select("id, email, first_name, last_name")
    .eq("id", applicantId)
    .maybeSingle();

  const { data: packets } = await supabaseAdmin
    .from("signature_packets")
    .select(
      "id, status, primary_document_type, created_at, expires_at, signature_packet_documents(id, completed_storage_bucket)"
    )
    .eq("crm_entity_type", "applicant")
    .eq("crm_entity_id", applicantId)
    .order("created_at", { ascending: false })
    .limit(40);

  const emailDefault =
      typeof applicant?.email === "string" && applicant.email.includes("@") ? applicant.email : "";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Saintly PDF Sign</h1>
          <p className="text-sm text-slate-600">Packets for this employee record.</p>
        </div>
        <Link href={`/admin/employees/${applicantId}`} className="text-sm font-semibold text-indigo-700 hover:underline">
          Back to employee
        </Link>
      </div>

      <EmployeePdfSignActions
        applicantId={applicantId}
        defaultEmail={emailDefault}
        isAdmin={isAdminOrHigher(staff)}
      />

      <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">History</div>
        <ul className="divide-y divide-slate-100">
          {(packets || []).map((p) => {
            const docs = (p as { signature_packet_documents?: { id: string }[] }).signature_packet_documents;
            const docId = docs?.[0]?.id;
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-slate-900">{p.primary_document_type}</div>
                  <div className="text-xs text-slate-600">
                    {p.status} · {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                  </div>
                </div>
                {docId && (p.status === "completed" || p.status === "signed") ? (
                  <a
                    className="text-xs font-semibold text-indigo-700 hover:underline"
                    href={`/api/pdf-sign/admin/download?packetDocumentId=${encodeURIComponent(docId)}`}
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </li>
            );
          })}
          {(!packets || packets.length === 0) && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No packets yet for this employee.</li>
          )}
        </ul>
      </div>
    </main>
  );
}
