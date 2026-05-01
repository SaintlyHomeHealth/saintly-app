"use client";

import { useState, useTransition } from "react";

import { archiveEmployeeAction } from "@/app/admin/employees/actions";
import {
  EMPLOYEE_DIRECTORY_DEFAULT_PAGE_SIZE,
  type EmployeeDirectorySegment,
  type EmployeeDirectorySortDir,
  type EmployeeDirectorySortKey,
} from "@/lib/admin/employee-directory-data";

type Props = {
  applicantId: string;
  archiveContext: "list" | "detail";
  /** When false, button is hidden (already inactive). */
  canArchive: boolean;
  variant?: "table" | "detail";
  /** Required when `archiveContext` is `list` so redirects preserve filters. */
  directoryFilters?: {
    segment: EmployeeDirectorySegment;
    q: string;
    sort: EmployeeDirectorySortKey;
    dir: EmployeeDirectorySortDir;
    page?: number;
    pageSize?: number;
  };
};

export function EmployeeArchiveButton({
  applicantId,
  archiveContext,
  canArchive,
  variant = "table",
  directoryFilters,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canArchive) return null;

  const btnCls =
    variant === "table"
      ? "rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
      : "rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100";

  const confirm = () => {
    const fd = new FormData();
    fd.set("applicantId", applicantId);
    fd.set("archiveContext", archiveContext);
    if (archiveContext === "list" && directoryFilters) {
      fd.set("segment", directoryFilters.segment);
      fd.set("q", directoryFilters.q);
      fd.set("sort", directoryFilters.sort);
      fd.set("dir", directoryFilters.dir);
      if (directoryFilters.page != null && directoryFilters.page > 1) {
        fd.set("page", String(directoryFilters.page));
      }
      if (
        directoryFilters.pageSize != null &&
        directoryFilters.pageSize !== EMPLOYEE_DIRECTORY_DEFAULT_PAGE_SIZE
      ) {
        fd.set("page_size", String(directoryFilters.pageSize));
      }
    }
    startTransition(async () => {
      await archiveEmployeeAction(fd);
    });
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnCls}>
        Archive
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="employee-archive-title"
            className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="employee-archive-title" className="text-lg font-semibold text-slate-900">
              Archive employee?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This removes the employee from active workflows but preserves compliance and history.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-800 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                onClick={confirm}
                disabled={pending}
              >
                {pending ? "Archiving…" : "Archive employee"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
