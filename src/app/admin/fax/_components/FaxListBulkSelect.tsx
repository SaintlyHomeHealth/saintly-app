"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { bulkHardDeleteFaxesAction, bulkSoftDeleteFaxesAction } from "@/app/admin/fax/actions";
import { crmActionBtnMuted, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";

type FaxListSelectContextValue = {
  selected: Set<string>;
  allIds: string[];
  allSelected: boolean;
  someSelected: boolean;
  toggleOne: (id: string) => void;
  toggleAll: () => void;
  clearSelected: () => void;
};

const FaxListSelectContext = createContext<FaxListSelectContextValue | null>(null);

function useFaxListSelect() {
  const ctx = useContext(FaxListSelectContext);
  if (!ctx) {
    throw new Error("Fax list selection components must be used inside FaxListSelectProvider.");
  }
  return ctx;
}

export function FaxListSelectProvider({ faxIds, children }: { faxIds: string[]; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const idsKey = faxIds.join(",");

  useEffect(() => {
    setSelected(new Set());
  }, [idsKey]);

  const allSelected = faxIds.length > 0 && faxIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (faxIds.length === 0) return new Set();
      const all = faxIds.every((id) => prev.has(id));
      if (all) return new Set();
      return new Set(faxIds);
    });
  }, [faxIds]);

  const clearSelected = useCallback(() => {
    setSelected(new Set());
  }, []);

  const value = useMemo(
    () => ({ selected, allIds: faxIds, allSelected, someSelected, toggleOne, toggleAll, clearSelected }),
    [selected, faxIds, allSelected, someSelected, toggleOne, toggleAll, clearSelected]
  );

  return <FaxListSelectContext.Provider value={value}>{children}</FaxListSelectContext.Provider>;
}

export function FaxSelectAllCheckbox() {
  const { allIds, allSelected, someSelected, toggleAll } = useFaxListSelect();
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  return (
    <input
      ref={selectAllRef}
      type="checkbox"
      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30"
      checked={allSelected}
      onChange={toggleAll}
      disabled={allIds.length === 0}
      aria-label="Select all faxes on this page"
    />
  );
}

export function FaxRowCheckbox({ faxId }: { faxId: string }) {
  const { selected, toggleOne } = useFaxListSelect();
  return (
    <input
      type="checkbox"
      className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30"
      checked={selected.has(faxId)}
      onChange={() => toggleOne(faxId)}
      aria-label="Select fax"
    />
  );
}

export function FaxListRowShell({
  faxId,
  className,
  children,
}: {
  faxId: string;
  className: string;
  children: ReactNode;
}) {
  const { selected } = useFaxListSelect();
  return <div className={`${className} ${selected.has(faxId) ? "bg-sky-50/80" : ""}`}>{children}</div>;
}

export function FaxBulkDeleteBar({ allowHardDelete }: { allowHardDelete: boolean }) {
  const router = useRouter();
  const { selected, someSelected, clearSelected } = useFaxListSelect();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const count = selected.size;

  const runBulk = (mode: "archive" | "hard") => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result =
        mode === "hard" ? await bulkHardDeleteFaxesAction(ids) : await bulkSoftDeleteFaxesAction(ids);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      clearSelected();
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2.5 text-sm">
        <p className="font-medium text-slate-700">
          {someSelected ? `${count} selected` : "Select faxes to delete more than one at a time"}
        </p>
        {someSelected ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 shadow-sm hover:bg-rose-50"
          >
            Delete selected
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-5 shadow-xl">
            <div className="space-y-2">
              <p className="text-base font-bold text-slate-900">
                Delete {count} fax{count === 1 ? "" : "es"}?
              </p>
              <p className="text-sm text-slate-600">
                Delete will archive the selected faxes and remove them from the inbox.
                {allowHardDelete ? " Admins can also permanently delete the faxes and their stored PDFs." : ""}
              </p>
              {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={crmActionBtnMuted}
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={crmActionBtnMuted}
                onClick={() => runBulk("archive")}
                disabled={pending}
              >
                {pending ? "Working…" : "Archive instead"}
              </button>
              {allowHardDelete ? (
                <button
                  type="button"
                  className={crmPrimaryCtaCls}
                  disabled={pending}
                  onClick={() => {
                    const confirmed = window.confirm(
                      `This will permanently delete ${count} fax${count === 1 ? "" : "es"} and cannot be undone.`
                    );
                    if (confirmed) runBulk("hard");
                  }}
                >
                  {pending ? "Working…" : "Permanently delete"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
