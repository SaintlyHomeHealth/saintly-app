"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { startVisitAction } from "./visit-actions";

const VISIT_TYPES = [
  { value: "visit", label: "Visit" },
  { value: "assessment", label: "Assessment" },
  { value: "admission", label: "Admission" },
  { value: "respite", label: "Respite" },
  { value: "therapy", label: "Therapy" },
  { value: "other", label: "Other" },
];

export function StartVisitDialog({
  assignablePatients,
  triggerClassName,
}: {
  assignablePatients: { id: string; label: string }[];
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [visitType, setVisitType] = useState("visit");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return assignablePatients;
    return assignablePatients.filter((p) => p.label.toLowerCase().includes(s));
  }, [assignablePatients, q]);

  async function onStart() {
    if (!patientId) {
      setMessage("Select a patient.");
      return;
    }
    setMessage(null);
    setPending(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // optional
        }
      }
      const r = await startVisitAction({ patientId, visitType, checkInLat: lat, checkInLng: lng });
      if (r.ok) {
        setOpen(false);
        setPatientId(null);
        setQ("");
        router.refresh();
      } else {
        setMessage(r.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={assignablePatients.length === 0}
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "inline-flex w-full items-center justify-center rounded-2xl border border-sky-200 bg-white px-5 py-3.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        }
      >
        Start visit
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-900/80">Start visit</p>
              <p className="text-sm font-semibold text-slate-900">Clock in for payroll</p>
            </div>
            <div className="space-y-4 overflow-y-auto px-4 py-4">
              <label className="block text-xs font-semibold text-slate-700">
                Search patient
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Type a name…"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-300 focus:ring-2"
                />
              </label>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100">
                {assignablePatients.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">No assignable patients. Contact dispatch.</p>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">No matches. Try another search.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {filtered.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setPatientId(p.id)}
                          className={`flex w-full px-3 py-2.5 text-left text-sm ${
                            patientId === p.id ? "bg-sky-50 font-semibold text-sky-950" : "text-slate-800 hover:bg-slate-50"
                          }`}
                        >
                          {p.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <label className="block text-xs font-semibold text-slate-700">
                Visit type
                <select
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-300 focus:ring-2"
                >
                  {VISIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              {message ? <p className="text-sm text-rose-700">{message}</p> : null}
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !patientId}
                onClick={onStart}
                className="rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Starting…" : "Clock in"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
