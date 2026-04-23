"use client";

import Link from "next/link";
import { memo } from "react";

export type PersonnelFileAuditItem = {
  label: string;
  status: string;
  sectionHref: string;
  showGo?: boolean;
  artifactHref: string | null;
  artifactLabel?: string;
  artifactExternal?: boolean;
  statusTone: "green" | "red" | "slate";
};

function getBadgeForTone(tone: PersonnelFileAuditItem["statusTone"]) {
  switch (tone) {
    case "green":
      return "border border-green-200 bg-green-50 text-green-700";
    case "red":
      return "border border-red-200 bg-red-50 text-red-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
}

const AuditItem = memo(function AuditItem({ item }: { item: PersonnelFileAuditItem }) {
  return (
    <div className="flex flex-col gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <p className="text-sm font-medium text-slate-900">{item.label}</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {item.showGo === false ? null : (
          <Link
            href={item.sectionHref}
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Go
          </Link>
        )}
        {item.artifactHref && item.status === "Complete" ? (
          item.artifactExternal ? (
            <a
              href={item.artifactHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              {item.artifactLabel || "View"}
            </a>
          ) : (
            <a
              href={item.artifactHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              {item.artifactLabel || "View"}
            </a>
          )
        ) : null}
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeForTone(
            item.statusTone
          )}`}
        >
          {item.status}
        </span>
      </div>
    </div>
  );
});

type Props = {
  items: PersonnelFileAuditItem[];
  surveyReadyBadge: "green" | "red";
};

/**
 * Client-only to defer JS for the full audit grid (many rows) until after the shell paints.
 */
function PersonnelFileAuditDeferredInner({ items, surveyReadyBadge }: Props) {
  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Personnel File Audit</h3>
          <p className="mt-1 text-sm text-slate-500">Quick pass/fail review for survey-safe file readiness.</p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
            surveyReadyBadge === "green"
              ? "border border-green-200 bg-green-50 text-green-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {surveyReadyBadge === "green" ? "Complete" : "Needs Review"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <AuditItem key={item.label} item={item} />
        ))}
      </div>
    </div>
  );
}

export default memo(PersonnelFileAuditDeferredInner);
