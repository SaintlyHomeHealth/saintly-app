"use client";

import { memo } from "react";

function getBadgeClasses(tone: "green" | "red" | "amber" | "sky" | "slate") {
  switch (tone) {
    case "green":
      return "border border-green-200 bg-green-50 text-green-700";
    case "red":
      return "border border-red-200 bg-red-50 text-red-700";
    case "amber":
      return "border border-amber-200 bg-amber-50 text-amber-700";
    case "sky":
      return "border border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
}

function WorkflowStatusCardInner({
  label,
  detail,
  status,
}: {
  label: string;
  detail: string;
  status: "Complete" | "Missing" | "In Progress" | "Not Required";
}) {
  const tone =
    status === "Complete"
      ? "green"
      : status === "Missing"
        ? "red"
        : status === "In Progress"
          ? "amber"
          : "slate";

  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>

        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(
            tone
          )}`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

export const WorkflowStatusCard = memo(WorkflowStatusCardInner);
