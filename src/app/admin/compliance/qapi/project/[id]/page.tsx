import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { ProjectPrint } from "@/components/compliance/print-docs";
import { QapiProjectForm } from "@/components/compliance/qapi-project-form";
import { complianceContext } from "@/lib/compliance/page-context";
import { getProject, readCompliance } from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

export default async function QapiProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await complianceContext({});
  const loaded = await readCompliance(() => getProject(id));
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="QAPI Project" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const detail = loaded.data;
  if (!detail) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="QAPI Project" description="This project was not found." />
      </AdminPageShell>
    );
  }
  const printedAt = formatAppDateTime(new Date());

  return (
    <>
      <div className="compliance-screen-only">
        <AdminPageShell>
          <AdminPageHeader eyebrow="Saintly Home Health" title={detail.project.project_name} description="Performance improvement project" />
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <QapiProjectForm
              project={detail.project}
              updates={detail.updates}
              today={ctx.today}
              canReopen={ctx.canUnlock}
            />
          </div>
          <Link href="/admin/compliance/qapi/project" className="text-sm font-semibold text-sky-700">
            All projects
          </Link>
        </AdminPageShell>
      </div>
      <div className="compliance-print-only mx-auto max-w-3xl bg-white p-6">
        <ProjectPrint project={detail.project} updates={detail.updates} printedAt={printedAt} />
      </div>
    </>
  );
}
