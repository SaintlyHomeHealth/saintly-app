import { Filter, Layers, ListFilter, Users } from "lucide-react";

import { AdminStatCard, AdminStatCardGrid } from "@/components/admin/design-system";

type Props = {
  totalFiltered: number;
  rangeStart: number;
  rangeEnd: number;
  baselineTotal: number | null;
  hasActiveFilters: boolean;
  hidingDeadByDefault: boolean;
  page: number;
  totalPages: number;
};

export function CrmLeadsStatsCards({
  totalFiltered,
  rangeStart,
  rangeEnd,
  baselineTotal,
  hasActiveFilters,
  hidingDeadByDefault,
  page,
  totalPages,
}: Props) {
  const rangeLabel = totalFiltered <= 0 ? "—" : `${rangeStart}–${rangeEnd}`;

  return (
    <AdminStatCardGrid columns={4}>
      <AdminStatCard label="Matching leads" value={totalFiltered} accent="slate" icon={Users} />
      <AdminStatCard
        label="This page"
        value={rangeLabel}
        accent="sky"
        icon={ListFilter}
        hint={totalFiltered > 0 ? `Page ${page} of ${totalPages}` : undefined}
      />
      <AdminStatCard
        label={hasActiveFilters ? "Unfiltered active" : "Active pipeline"}
        value={hasActiveFilters && baselineTotal !== null ? baselineTotal : totalFiltered}
        accent="emerald"
        icon={Layers}
        hint={hasActiveFilters ? "Before list filters" : "Excludes deleted rows"}
      />
      <AdminStatCard
        label="Dead leads"
        value={hidingDeadByDefault ? "Hidden" : "Included"}
        accent={hidingDeadByDefault ? "amber" : "rose"}
        icon={Filter}
        emphasize={hidingDeadByDefault}
        hint={hidingDeadByDefault ? "Enable Include dead to show" : "Showing dead / not qualified"}
      />
    </AdminStatCardGrid>
  );
}
