import Link from "next/link";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { TemplateFieldEditor } from "./TemplateFieldEditor";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }
  const { templateId } = await params;

  const { data: tpl } = await supabaseAdmin
    .from("signature_templates")
    .select("id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (!tpl) {
    redirect("/admin/signatures/templates");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/admin/signatures/templates"
            className="text-xs font-semibold uppercase tracking-wide text-indigo-700 underline-offset-2 hover:underline"
          >
            ← Templates
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{tpl.name}</h1>
          <p className="text-sm text-slate-600">
            Place and resize fields on the PDF. Settings stay in the panel on the right so the
            document stays visible.
          </p>
        </div>
      </div>
      <TemplateFieldEditor templateId={tpl.id} />
    </main>
  );
}
