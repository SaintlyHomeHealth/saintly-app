"use client";

import { memo } from "react";

import EmployeeDocumentActions from "./EmployeeDocumentActions";
import type { PersonnelFileAuditRow } from "@/lib/employee-requirements/personnel-file-requirements";

export type PersonnelFileAuditItem = PersonnelFileAuditRow;

function getBadgeForTone(tone: PersonnelFileAuditRow["statusTone"]) {
  switch (tone) {
    case "green":
      return "border border-green-200 bg-green-50 text-green-700";
    case "red":
      return "border border-red-200 bg-red-50 text-red-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
}

const AuditItem = memo(function AuditItem({ item }: { item: PersonnelFileAuditRow }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-2 pr-3 text-sm font-medium text-slate-900">{item.label}</td>
      <td className="py-2 pr-3">
        <span
          className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${getBadgeForTone(
            item.statusTone
          )}`}
        >
          {item.status}
        </span>
      </td>
      <td className="py-2 text-right">
        <EmployeeDocumentActions
          employeeId=""
          itemType={item.itemType === "summary" ? "form" : item.itemType}
          uploadLabel={item.label}
          documentType={item.label}
          workflowOpenHref={item.openHref}
          portalHref={item.portalHref}
          viewUrl={item.viewHref}
          downloadUrl={item.downloadHref}
          compact
        />
      </td>
    </tr>
  );
});

type Props = {
  items: PersonnelFileAuditRow[];
  surveyReadyBadge: "green" | "red";
};

/**
 * Client-only to defer JS for the full audit grid (many rows) until after the shell paints.
 */
function PersonnelFileAuditDeferredInner({ items, surveyReadyBadge }: Props) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Personnel file audit</h3>
          <p className="mt-0.5 text-xs text-slate-500">Survey-ready checklist</p>
        </div>
        <span
          className={`inline-flex w-fit rounded border px-2 py-0.5 text-xs font-semibold ${
            surveyReadyBadge === "green"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {surveyReadyBadge === "green" ? "Complete" : "Needs review"}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Item</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>{items.map((item) => (
            <AuditItem key={item.label} item={item} />
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(PersonnelFileAuditDeferredInner);
