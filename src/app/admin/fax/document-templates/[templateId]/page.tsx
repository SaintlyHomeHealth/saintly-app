import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import {
  getFaxDocumentTemplateById,
  missingFaxDocumentTemplateSchema,
} from "@/lib/fax/fax-document-templates-server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { DocumentTemplateForm } from "../_components/DocumentTemplateForm";
import { faxUi } from "@/app/admin/fax/_components/fax-center-ui";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ templateId: string }> };

export default async function EditFaxDocumentTemplatePage({ params }: Props) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");

  const { templateId } = await params;

  let template: Awaited<ReturnType<typeof getFaxDocumentTemplateById>> = null;
  try {
    template = await getFaxDocumentTemplateById(templateId);
  } catch (err) {
    if (missingFaxDocumentTemplateSchema(err instanceof Error ? { message: err.message } : null)) {
      redirect("/admin/fax/document-templates");
    }
    throw err;
  }

  if (!template) notFound();

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin Fax"
        title={template.name}
        description="Review or update the saved template text and optional attachment."
        actions={
          <Link href="/admin/fax/document-templates" className={crmActionBtnSky}>
            Back to templates
          </Link>
        }
      />

      <section className={`${faxUi.section} max-w-3xl`}>
        <DocumentTemplateForm mode="edit" initial={template} />
      </section>
    </div>
  );
}
