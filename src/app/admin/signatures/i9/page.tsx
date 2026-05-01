import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";
import { redirect } from "next/navigation";

import { I9Section2JsonForm } from "./I9Section2JsonForm";

export default async function AdminI9CasesPage() {
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  const { data: rows } = await supabaseAdmin
    .from("i9_cases")
    .select(
      "id, applicant_id, workflow_phase, review_method, section1_packet_id, created_at, updated_at, section2_completed_at"
    )
    .order("created_at", { ascending: false })
    .limit(60);

  const packetIds = (rows || [])
    .map((r) => r.section1_packet_id)
    .filter((id): id is string => Boolean(id));

  let docByPacket = new Map<string, string>();
  if (packetIds.length > 0) {
    const { data: docs } = await supabaseAdmin
      .from("signature_packet_documents")
      .select("id, packet_id")
      .in("packet_id", packetIds);
    docByPacket = new Map((docs || []).map((d) => [d.packet_id, d.id]));
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">I-9 cases</h1>
          <p className="text-sm text-slate-600">
            Restricted to admins. Downloads use short-lived signed URLs; completed PDFs stay in the{" "}
            <code className="rounded bg-slate-100 px-1">i9-documents</code> bucket.
          </p>
        </div>
        <Link href="/admin/signatures" className="text-sm font-semibold text-indigo-700 hover:underline">
          Back
        </Link>
      </div>

      <div className="space-y-4">
        {(rows || []).map((row) => {
          const docId = row.section1_packet_id ? docByPacket.get(row.section1_packet_id) : undefined;
          return (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Applicant {row.applicant_id}</div>
                  <div className="text-xs text-slate-600">
                    Phase: {row.workflow_phase} · Review: {row.review_method || "—"}
                  </div>
                  <div className="text-xs text-slate-500">
                    Created {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                  </div>
                </div>
                {docId ? (
                  <a
                    className="text-xs font-semibold text-indigo-700 hover:underline"
                    href={`/api/pdf-sign/admin/download?packetDocumentId=${encodeURIComponent(docId)}`}
                  >
                    Download PDF
                  </a>
                ) : null}
              </div>
              {row.workflow_phase === "section2" ? <I9Section2JsonForm i9CaseId={row.id} /> : null}
              {row.workflow_phase === "completed" && row.section2_completed_at ? (
                <p className="mt-2 text-xs text-emerald-700">
                  Completed {new Date(row.section2_completed_at).toLocaleString()}
                </p>
              ) : null}
            </div>
          );
        })}
        {(!rows || rows.length === 0) && <p className="text-sm text-slate-500">No I-9 cases yet.</p>}
      </div>
    </main>
  );
}
