import Link from "next/link";
import { redirect } from "next/navigation";

import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { TemplateUploadForm } from "./TemplateUploadForm";

export default async function NewTemplatePage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Upload PDF template</h1>
          <p className="text-sm text-slate-600">
            Upload your PDF, give it a name, and pick a category. After upload you&apos;ll be
            taken to the visual editor where you can place signature fields.
          </p>
        </div>
        <Link
          href="/admin/signatures/templates"
          className="text-sm font-semibold text-indigo-700 underline-offset-2 hover:underline"
        >
          ← Templates
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <TemplateUploadForm />
      </div>
    </main>
  );
}
