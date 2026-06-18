type Props = {
  total: number;
  newLeads: number;
  newToday: number;
  formFacebookLeads: number;
  resumeUploads: number;
};

const cardBase =
  "rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-sky-50/40 px-4 py-3.5 shadow-sm shadow-slate-200/40";

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`${cardBase} ${accent ? "border-sky-200/80 ring-1 ring-sky-100" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-sky-800" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

export function RecruitingWorkspaceStatsCards({
  total,
  newLeads,
  newToday,
  formFacebookLeads,
  resumeUploads,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard label="Total leads" value={total} />
      <StatCard label="New leads" value={newLeads} />
      <StatCard label="New today" value={newToday} accent />
      <StatCard label="Form / Facebook" value={formFacebookLeads} />
      <StatCard label="Resume uploads" value={resumeUploads} />
    </div>
  );
}
