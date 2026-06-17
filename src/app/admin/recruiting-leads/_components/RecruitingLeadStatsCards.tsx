type Props = {
  total: number;
  newLeads: number;
  facebookLeads: number;
  otherLeads: number;
};

const cardBase =
  "rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm shadow-slate-200/40";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={cardBase}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function RecruitingLeadStatsCards({ total, newLeads, facebookLeads, otherLeads }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total recruiting leads" value={total} />
      <StatCard label="New leads" value={newLeads} />
      <StatCard label="Facebook leads" value={facebookLeads} />
      <StatCard label="Website / resume / legacy" value={otherLeads} />
    </div>
  );
}
