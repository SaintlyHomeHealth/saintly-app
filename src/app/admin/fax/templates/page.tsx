import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { SAINTLY_RETURN_FAX_DISPLAY } from "@/lib/fax/cover-sheet-constants";
import {
  listFaxCoverTemplates,
  missingFaxCoverTemplateSchema,
} from "@/lib/fax/fax-cover-templates-server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { FaxCoverTemplateManager } from "./_components/FaxCoverTemplateManager";

export const dynamic = "force-dynamic";

export default async function FaxCoverTemplatesPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");

  let templates: Awaited<ReturnType<typeof listFaxCoverTemplates>> = [];
  let schemaMissing = false;
  try {
    templates = await listFaxCoverTemplates();
  } catch (err) {
    if (missingFaxCoverTemplateSchema(err instanceof Error ? { message: err.message } : null)) {
      schemaMissing = true;
    } else {
      throw err;
    }
  }

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin Fax"
        title="Cover sheet templates"
        description="Reusable fax cover sheets for outbound packets. Every generated cover includes the HIPAA confidentiality notice and Saintly return fax number."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/fax" className={crmActionBtnSky}>
              Back to Fax Center
            </Link>
            <Link href="/admin/fax/document-templates" className={crmActionBtnSky}>
              Document templates
            </Link>
            <span className="rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
              Return fax: {SAINTLY_RETURN_FAX_DISPLAY}
            </span>
          </div>
        }
      />

      {schemaMissing ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Apply the fax cover sheet migration to enable templates.
        </section>
      ) : (
        <FaxCoverTemplateManager initialTemplates={templates} />
      )}
    </div>
  );
}
