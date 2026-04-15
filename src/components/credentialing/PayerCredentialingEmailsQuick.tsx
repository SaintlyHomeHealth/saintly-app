"use client";

import { Copy, Mail, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { savePayerCredentialingRecordEmails } from "@/app/admin/credentialing/actions";

function newRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r_${Math.random().toString(36).slice(2)}`;
}

type Row = {
  id: string;
  email: string;
  label: string;
  is_primary: boolean;
};

function buildFormData(credentialingId: string, rows: Row[]): FormData {
  const fd = new FormData();
  fd.append("credentialing_id", credentialingId);
  const nonEmpty = rows.filter((r) => r.email.trim().length > 0);
  fd.append("email_row_count", String(nonEmpty.length));
  nonEmpty.forEach((r, i) => {
    fd.append(`email_${i}_address`, r.email.trim());
    fd.append(`email_${i}_label`, r.label.trim());
  });
  const pi = nonEmpty.findIndex((r) => r.is_primary);
  const primaryIdx = pi >= 0 ? pi : 0;
  fd.append("email_primary", String(primaryIdx));
  return fd;
}

export function PayerCredentialingEmailsQuick({
  credentialingId,
  initialRows,
}: {
  credentialingId: string;
  initialRows: { email: string; label: string; is_primary: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<Row[]>([]);

  const seeded = useMemo(() => {
    const base: Row[] =
      initialRows.length > 0
        ? initialRows.map((r, i) => ({
            id: newRowId(),
            email: r.email,
            label: r.label ?? "",
            is_primary: r.is_primary ?? i === 0,
          }))
        : [{ id: newRowId(), email: "", label: "", is_primary: true }];
    if (!base.some((r) => r.is_primary) && base.length) base[0] = { ...base[0], is_primary: true };
    return base;
  }, [initialRows]);

  const [rows, setRows] = useState<Row[]>(seeded);

  useEffect(() => {
    setRows(seeded);
  }, [seeded]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const persist = useCallback(
    (nextRows: Row[]) => {
      startTransition(async () => {
        await savePayerCredentialingRecordEmails(buildFormData(credentialingId, nextRows));
        router.refresh();
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 1400);
      });
    },
    [credentialingId, router]
  );

  function scheduleDebouncedPersist(nextRows: Row[]) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      persist(nextRows);
    }, 650);
  }

  function flushDebouncedPersist() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    persist(rowsRef.current);
  }

  function addRow() {
    setRows((prev) => [...prev, { id: newRowId(), email: "", label: "", is_primary: false }]);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      const fixed =
        next.length === 0
          ? [{ id: newRowId(), email: "", label: "", is_primary: true }]
          : !next.some((r) => r.is_primary)
            ? next.map((r, i) => (i === 0 ? { ...r, is_primary: true } : r))
            : next;
      persist(fixed);
      return fixed;
    });
  }

  function setPrimary(id: string) {
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, is_primary: r.id === id }));
      persist(next);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Email addresses</p>
        <div className="flex items-center gap-2">
          {savedFlash ? (
            <span className="text-[11px] font-medium text-emerald-700" role="status">
              Saved
            </span>
          ) : null}
          {pending ? <span className="text-[11px] text-slate-500">Saving…</span> : null}
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-50"
          >
            Add email
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const trimmed = row.email.trim();
          const mailto = trimmed ? `mailto:${encodeURIComponent(trimmed)}` : "";
          return (
            <li
              key={row.id}
              className={`rounded-2xl border px-3 py-2.5 sm:px-4 ${
                row.is_primary
                  ? "border-sky-300 bg-sky-50/90 ring-1 ring-sky-200/80"
                  : "border-slate-200/90 bg-white"
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      value={row.email}
                      disabled={pending}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => {
                          const next = prev.map((r) => (r.id === row.id ? { ...r, email: v } : r));
                          scheduleDebouncedPersist(next);
                          return next;
                        });
                      }}
                      onBlur={flushDebouncedPersist}
                      placeholder="name@domain.com"
                      autoComplete="email"
                      className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-60"
                    />
                    {row.is_primary ? (
                      <span className="shrink-0 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Primary
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={row.label}
                      disabled={pending}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => {
                          const next = prev.map((r) => (r.id === row.id ? { ...r, label: v } : r));
                          scheduleDebouncedPersist(next);
                          return next;
                        });
                      }}
                      onBlur={flushDebouncedPersist}
                      placeholder="Label"
                      maxLength={120}
                      className="max-w-[220px] rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 placeholder:font-normal placeholder:normal-case placeholder:text-slate-400 disabled:opacity-60"
                    />
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                  {mailto ? (
                    <a
                      href={mailto}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                      Email
                    </a>
                  ) : (
                    <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-100 px-2 py-1 text-[11px] text-slate-400">
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                      Email
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!trimmed || pending}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(trimmed);
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    Copy
                  </button>
                  {!row.is_primary ? (
                    <button
                      type="button"
                      disabled={!trimmed || pending}
                      onClick={() => setPrimary(row.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Star className="h-3.5 w-3.5" aria-hidden />
                      Primary
                    </button>
                  ) : null}
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeRow(row.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
