import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { redirect } from "next/navigation";

import { PdfSignTemplateUploadForm } from "./PdfSignTemplateUploadForm";

const DOC_LABEL: Record<string, string> = {
  generic_contract: "Contract / agreement",
  w9: "W-9",
  i9: "I-9",
};

export default async function AdminPdfSignTemplatesPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  const { data: rows } = await supabaseAdmin
    .from("signature_templates")
    .select("id, name, document_type, version, is_active, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40">
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/admin/signatures"
              className="text-xs font-semibold uppercase tracking-wide text-sky-800/90 hover:underline"
            >
              ← Saintly PDF Sign
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Templates</h1>
            <p className="mt-2 max-w-xl text-slate-600">
              Manage reusable documents and field placements before sending.
            </p>
          </div>
          <a
            href="#upload-template"
            className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-3 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 transition hover:from-amber-500 hover:to-amber-600"
          >
            Upload new template
          </a>
        </div>

        {/* Primary: existing templates */}
        <section className="mt-10 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50">
          <div className="border-b border-slate-100 bg-slate-50/90 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Your templates</h2>
            <p className="mt-0.5 text-xs text-slate-500">Edit fields or send a signing packet.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-white text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Template</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last updated</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(rows || []).map((row) => (
                  <tr key={row.id} className="bg-white transition hover:bg-sky-50/50">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{row.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">Version {row.version}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-800">
                      {DOC_LABEL[row.document_type] || row.document_type}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                          (row.is_active
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-slate-100 text-slate-600")
                        }
                      >
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                      {row.updated_at ? formatAppDateTime(row.updated_at) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/admin/signatures/templates/${encodeURIComponent(row.id)}`}
                          className="inline-flex rounded-xl bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-800"
                        >
                          Edit fields
                        </Link>
                        <Link
                          href={`/admin/signatures/send?templateId=${encodeURIComponent(row.id)}`}
                          className="inline-flex rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          Send packet
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!rows || rows.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <p className="text-slate-600">No templates yet.</p>
                      <p className="mt-2 text-sm text-slate-500">
                        Add your first PDF below, or{" "}
                        <a href="#upload-template" className="font-semibold text-sky-800 underline">
                          jump to upload
                        </a>
                        .
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="upload-template"
          className="mt-12 rounded-2xl border border-dashed border-slate-200 bg-white/90 p-6 shadow-sm scroll-mt-24"
        >
          <h2 className="text-lg font-semibold text-slate-900">Add a template</h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload a PDF (W-9, contract, or I-9). You’ll place fields on the next screen after upload.
          </p>
          <div className="mt-6">
            <PdfSignTemplateUploadForm />
          </div>
        </section>
      </main>
    </div>
  );
}
