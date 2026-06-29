"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";
import {
  buildAdminRecruitingLeadsListHref,
  type AdminRecruitingLeadsListFilters,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";

const DEBOUNCE_MS = 300;

type Props = {
  filters: AdminRecruitingLeadsListFilters;
};

export function RecruitingLeadKeywordSearch({ filters }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(filters.q);
  const skipDebounceRef = useRef(false);

  useEffect(() => {
    setDraft(filters.q);
    skipDebounceRef.current = true;
  }, [filters.q]);

  useEffect(() => {
    if (skipDebounceRef.current) {
      skipDebounceRef.current = false;
      return;
    }

    const trimmed = draft.trim();
    if (trimmed === filters.q.trim()) return;

    const handle = window.setTimeout(() => {
      router.replace(
        buildAdminRecruitingLeadsListHref({
          tab: filters.tab,
          dateRange: filters.dateRange,
          status: filters.status,
          coverageArea: filters.coverageArea,
          source: filters.source,
          role: filters.role,
          startDate: filters.startDate,
          q: trimmed,
          page: 1,
        })
      );
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [
    draft,
    filters.coverageArea,
    filters.dateRange,
    filters.q,
    filters.role,
    filters.source,
    filters.startDate,
    filters.status,
    filters.tab,
    router,
  ]);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm shadow-slate-200/40">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Search applicants
        </span>
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search applicants by name, phone, email, city, area, notes, or source…"
          className={crmFilterInputCls}
          autoComplete="off"
        />
      </label>
    </div>
  );
}
