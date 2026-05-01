import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { redirect } from "next/navigation";

import { PdfSignTemplateUploadForm } from "./PdfSignTemplateUploadForm";

export default async function AdminPdfSignTemplatesPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  const { data: rows } = await supabaseAdmin
    .from("signature_templates")
    .select("id, name, document_type, version, is_active, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">PDF templates</h1>
          <p className="text-sm text-slate-600">
            Upload the official IRS W-9 PDF (or other templates). Pre-fill AcroForm names when the PDF exposes a form
            layer.
          </p>
        </div>
        <Link
          href="/admin/signatures"
          className="text-sm font-semibold text-indigo-700 underline-offset-2 hover:underline"
        >
          Back
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Upload</h2>
        <PdfSignTemplateUploadForm />
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">Existing</div>
        <ul className="divide-y divide-slate-100">
          {(rows || []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <div className="font-medium text-slate-900">{row.name}</div>
                <div className="text-xs text-slate-600">
                  {row.document_type} · v{row.version} · {row.is_active ? "active" : "inactive"}
                </div>
              </div>
              <code className="rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-700">{row.id}</code>
            </li>
          ))}
          {(!rows || rows.length === 0) && (
            <li className="px-4 py-6 text-center text-slate-500">No templates yet.</li>
          )}
        </ul>
      </div>
    </main>
  );
}
