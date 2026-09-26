"use client";

import { useRouter } from "next/navigation";

import { complianceHref } from "@/lib/compliance/period";
import { SelectInput } from "@/components/compliance/ui";

export function PeriodPicker({
  year,
  quarter,
  years,
  path,
}: {
  year: number;
  quarter: number;
  years: number[];
  path: string;
}) {
  const router = useRouter();

  function go(nextYear: number, nextQuarter: number) {
    router.push(complianceHref(path, nextYear, nextQuarter));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block min-w-32">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Year</span>
        <SelectInput value={year} onChange={(event) => go(Number(event.target.value), quarter)}>
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectInput>
      </label>
      <label className="block min-w-32">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Quarter</span>
        <SelectInput value={quarter} onChange={(event) => go(year, Number(event.target.value))}>
          <option value={1}>Q1</option>
          <option value={2}>Q2</option>
          <option value={3}>Q3</option>
          <option value={4}>Q4</option>
        </SelectInput>
      </label>
    </div>
  );
}
