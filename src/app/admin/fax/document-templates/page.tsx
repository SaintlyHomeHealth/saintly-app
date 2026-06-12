import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import {
  listFaxDocumentTemplates,
  missingFaxDocumentTemplateSchema,
} from "@/lib/fax/fax-document-templates-server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { faxUi } from "@/app/admin/fax/_components/fax-center-ui";

export const dynamic = "force-dynamic";

export default async function FaxDocumentTemplatesPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");

  let templates: Awaited<ReturnType<typeof listFaxDocumentTemplates>> = [];
  let schemaMissing = false;
  try {
    templates = await listFaxDocumentTemplates();
  } catch (err) {
    if (missingFaxDocumentTemplateSchema(err instanceof Error ? { message: err.message } : null)) {
      schemaMissing = true;
    } else {
      throw err;
    }
  }

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin Fax"
        title="Document templates"
        description="Save reusable clinical document text and optional reference attachments for fax workflows."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/fax" className={crmActionBtnSky}>
              Back to Fax Center
            </Link>
            <Link href="/admin/fax/document-templates/new" className={faxUi.btnPrimary}>
              Create template
            </Link>
          </div>
        }
      />

      {schemaMissing ? (
        <section className={faxUi.alertWarn}>
          Apply the fax document templates migration to enable this feature.
        </section>
      ) : (
        <section className={faxUi.card}>
          <div className="min-w-[720px] divide-y divide-slate-100">
            <div className="grid grid-cols-[1fr_160px_140px] gap-3 bg-slate-50/80 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <div>Template</div>
              <div>Content</div>
              <div>Actions</div>
            </div>
            {templates.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-slate-500">
                No document templates yet.{" "}
                <Link href="/admin/fax/document-templates/new" className="font-semibold text-sky-700 hover:underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              templates.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[1fr_160px_140px] items-start gap-3 px-4 py-4 text-sm transition hover:bg-slate-50/50"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{t.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Updated {t.updated_at ? formatAppDateTime(t.updated_at) : "—"}
                    </p>
                  </div>
                  <div className="pt-0.5 text-xs text-slate-600">
                    {t.body_content.trim() ? "Text" : null}
                    {t.body_content.trim() && t.attachment_storage_path ? " + " : null}
                    {t.attachment_storage_path ? "Attachment" : null}
                    {!t.body_content.trim() && !t.attachment_storage_path ? "—" : null}
                  </div>
                  <div>
                    <Link
                      href={`/admin/fax/document-templates/${encodeURIComponent(t.id)}`}
                      className={faxUi.btnSecondary}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <p className="text-xs text-slate-500">
        <Link href="/admin/fax/templates" className="font-semibold text-sky-700 hover:underline">
          Cover sheet templates
        </Link>
        {" · "}
        Cover sheets auto-fill fax packet subject and message. Document templates store reusable body text.
      </p>
    </div>
  );
}
