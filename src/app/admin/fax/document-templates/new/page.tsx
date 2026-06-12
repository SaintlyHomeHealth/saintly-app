import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { DocumentTemplateForm } from "./_components/DocumentTemplateForm";
import { faxUi } from "@/app/admin/fax/_components/fax-center-ui";

export default async function NewFaxDocumentTemplatePage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin Fax"
        title="Create document template"
        description="Paste document text, optionally attach a reference file, and save a reusable template."
        actions={
          <Link href="/admin/fax/document-templates" className={crmActionBtnSky}>
            Back to templates
          </Link>
        }
      />

      <section className={`${faxUi.section} max-w-3xl`}>
        <DocumentTemplateForm mode="create" />
      </section>
    </div>
  );
}
