import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { QapiProjectForm } from "@/components/compliance/qapi-project-form";
import { complianceContext } from "@/lib/compliance/page-context";
import { listProjects, readCompliance } from "@/lib/compliance/queries";

export const dynamic = "force-dynamic";

export default async function NewQapiProjectPage() {
  const ctx = await complianceContext({});
  const loaded = await readCompliance(() => listProjects());
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="QAPI Project" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const projects = loaded.data;
  const active = projects.find((project) => project.status !== "completed");

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Saintly Home Health"
        title="QAPI Performance Improvement Project"
        description="One main project at a time. Older projects stay in the list."
      />
      {projects.length > 0 ? (
        <div className="space-y-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/admin/compliance/qapi/project/${project.id}`}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <span className="font-semibold text-slate-900">{project.project_name}</span>
              <span className="text-sm font-bold uppercase text-slate-500">{project.status}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {active ? (
        <p className="text-sm text-slate-600">
          An active project is already open. Finish or complete it before starting another, or open it above.
        </p>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <QapiProjectForm project={null} updates={[]} today={ctx.today} canReopen={ctx.canUnlock} />
        </div>
      )}
      <Link href="/admin/compliance/qapi" className="text-sm font-semibold text-sky-700">
        Back to QAPI
      </Link>
    </AdminPageShell>
  );
}
