import { CalendarClock, FileText, MessageSquare, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Props = {
  total: number;
  newLeads: number;
  newToday: number;
  formFacebookLeads: number;
  resumeUploads: number;
};

type Accent = "slate" | "sky" | "amber" | "indigo" | "violet";

const ACCENT: Record<
  Accent,
  { ring: string; iconWrap: string; value: string }
> = {
  slate: {
    ring: "ring-slate-100",
    iconWrap: "bg-slate-100 text-slate-600",
    value: "text-slate-900",
  },
  sky: {
    ring: "ring-sky-100",
    iconWrap: "bg-sky-100 text-sky-700",
    value: "text-sky-800",
  },
  amber: {
    ring: "ring-amber-100",
    iconWrap: "bg-amber-100 text-amber-700",
    value: "text-amber-800",
  },
  indigo: {
    ring: "ring-indigo-100",
    iconWrap: "bg-indigo-100 text-indigo-700",
    value: "text-indigo-800",
  },
  violet: {
    ring: "ring-violet-100",
    iconWrap: "bg-violet-100 text-violet-700",
    value: "text-violet-800",
  },
};

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
  emphasize = false,
}: {
  label: string;
  value: number;
  accent: Accent;
  icon: LucideIcon;
  emphasize?: boolean;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-sm shadow-slate-200/40 ring-1 transition hover:-translate-y-px hover:shadow-md ${a.ring} ${
        emphasize ? "bg-gradient-to-br from-amber-50/60 to-white" : ""
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.iconWrap}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-2xl font-bold leading-tight tabular-nums ${a.value}`}>{value}</p>
      </div>
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
      <StatCard label="Total leads" value={total} accent="slate" icon={Users} />
      <StatCard label="New leads" value={newLeads} accent="sky" icon={Sparkles} />
      <StatCard label="New today" value={newToday} accent="amber" icon={CalendarClock} emphasize />
      <StatCard label="Form / Facebook" value={formFacebookLeads} accent="indigo" icon={MessageSquare} />
      <StatCard label="Resume uploads" value={resumeUploads} accent="violet" icon={FileText} />
    </div>
  );
}
