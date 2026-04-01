"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { updateIncomingCallAlert } from "./actions";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";

export type IncomingCallAlertRow = {
  id: string;
  phone_call_id: string;
  external_call_id: string;
  from_e164: string | null;
  to_e164: string | null;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  crm_contact_display_name: string | null;
};

function followUpPill(status: string) {
  const s = status.trim();
  const base = "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold";
  switch (s) {
    case "new":
      return `${base} border border-amber-300 bg-amber-100 text-amber-950`;
    case "acknowledged":
      return `${base} border border-sky-300 bg-sky-100 text-sky-950`;
    case "resolved":
      return `${base} border border-slate-200 bg-slate-100 text-slate-500`;
    default:
      return `${base} border border-slate-200 bg-slate-50 text-slate-700`;
  }
}

/** SSR + first client paint: identical neutral chrome (see `mounted` guard). */
const NEUTRAL_ROW_CLASS =
  "border-b border-slate-100 last:border-0 bg-white transition-colors";
const NEUTRAL_STATUS_PILL_CLASS =
  "inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700";

/** Row chrome follows alert status until Ack/Resolve — not a timed flash. */
function alertRowClasses(status: string) {
  const s = status.trim();
  const base = "border-b transition-colors last:border-0";
  switch (s) {
    case "new":
      return `${base} bg-amber-50 ring-1 ring-inset ring-amber-300/90`;
    case "acknowledged":
      return `${base} bg-sky-50/90 border-l-4 border-l-sky-500`;
    case "resolved":
      return `${base} bg-slate-50/80 text-slate-500`;
    default:
      return `${base} border-slate-100`;
  }
}

function sortAlertsDesc(a: IncomingCallAlertRow, b: IncomingCallAlertRow) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/** Server RSC snapshot wins on overlap; keeps client-only realtime rows until the next server refresh. */
function mergeServerSnapshot(
  server: IncomingCallAlertRow[],
  client: IncomingCallAlertRow[],
  maxVisibleInner: number
): IncomingCallAlertRow[] {
  const byId = new Map<string, IncomingCallAlertRow>();
  for (const r of server) byId.set(r.id, r);
  for (const r of client) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return Array.from(byId.values()).sort(sortAlertsDesc).slice(0, maxVisibleInner);
}

function isAlertRow(v: unknown): v is IncomingCallAlertRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.phone_call_id === "string" &&
    typeof o.external_call_id === "string" &&
    typeof o.status === "string" &&
    typeof o.created_at === "string"
  );
}

function toAlertRowWithCrmSlot(v: IncomingCallAlertRow | Record<string, unknown>): IncomingCallAlertRow {
  const o = v as Record<string, unknown>;
  const crm =
    typeof o.crm_contact_display_name === "string" && o.crm_contact_display_name.trim()
      ? o.crm_contact_display_name.trim()
      : null;
  return {
    id: String(o.id),
    phone_call_id: String(o.phone_call_id),
    external_call_id: String(o.external_call_id),
    from_e164: typeof o.from_e164 === "string" ? o.from_e164 : null,
    to_e164: typeof o.to_e164 === "string" ? o.to_e164 : null,
    status: String(o.status),
    created_at: String(o.created_at),
    acknowledged_at: typeof o.acknowledged_at === "string" ? o.acknowledged_at : null,
    resolved_at: typeof o.resolved_at === "string" ? o.resolved_at : null,
    crm_contact_display_name: crm,
  };
}

async function resolveAlertFromDisplayName(fromE164: string | null): Promise<string | null> {
  if (!fromE164?.trim()) return null;
  const supabase = createBrowserSupabaseClient();
  const m = await findContactByIncomingPhone(supabase, fromE164);
  if (!m) return null;
  const fn = (m.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
  return parts || null;
}

function playSoftIncomingBeep() {
  try {
    const AC =
      typeof window !== "undefined" &&
      (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.06;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    /* autoplay or API blocked */
  }
}

function notifyIncomingIfAllowed(from: string | null, crmName?: string | null) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("Incoming call", {
      body: crmName?.trim() ? `From ${crmName.trim()}` : from ? `From ${from}` : "Saintly line",
      tag: "saintly-incoming-call",
    });
  } catch {
    /* ignore */
  }
}

type Props = {
  initialAlerts: IncomingCallAlertRow[];
  /** Max rows to keep rendered (also caps realtime merges). */
  maxVisible?: number;
};

export function IncomingCallAlertsLive({ initialAlerts, maxVisible = 50 }: Props) {
  const [alerts, setAlerts] = useState<IncomingCallAlertRow[]>(() => initialAlerts);
  /** false on server and on the first client render — status styling only after mount. */
  const [mounted, setMounted] = useState(false);
  const initialAlertsRef = useRef(initialAlerts);
  useLayoutEffect(() => {
    initialAlertsRef.current = initialAlerts;
  });

  const serverSnapshotKey = useMemo(
    () =>
      JSON.stringify(
        initialAlerts.map((a) => [
          a.id,
          a.status,
          a.acknowledged_at,
          a.resolved_at,
          a.created_at,
          a.crm_contact_display_name,
        ])
      ),
    [initialAlerts]
  );

  useEffect(() => {
    setAlerts((prev) => mergeServerSnapshot(initialAlertsRef.current, prev, maxVisible));
  }, [serverSnapshotKey, maxVisible]);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  /** Client backfill when SSR embed has no linked contact yet (or RLS gap). */
  useEffect(() => {
    for (const a of initialAlertsRef.current) {
      if (a.crm_contact_display_name?.trim() || !a.from_e164?.trim()) continue;
      void resolveAlertFromDisplayName(a.from_e164).then((name) => {
        if (!name) return;
        setAlerts((p) =>
          p.map((row) =>
            row.id === a.id && row.from_e164 === a.from_e164 ? { ...row, crm_contact_display_name: name } : row
          )
        );
      });
    }
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("incoming_call_alerts_admin_phone")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incoming_call_alerts" },
        (payload) => {
          const ev = payload.eventType;
          if (ev === "INSERT") {
            const row = payload.new;
            if (!isAlertRow(row)) return;
            const nextRow = toAlertRowWithCrmSlot(row);
            setAlerts((prev) => {
              const deduped = prev.filter((x) => x.id !== nextRow.id);
              return [nextRow, ...deduped].sort(sortAlertsDesc).slice(0, maxVisible);
            });
            if (!nextRow.crm_contact_display_name && nextRow.from_e164) {
              void resolveAlertFromDisplayName(nextRow.from_e164).then((name) => {
                if (!name) return;
                setAlerts((p) =>
                  p.map((a) =>
                    a.id === nextRow.id && a.from_e164 === nextRow.from_e164
                      ? { ...a, crm_contact_display_name: name }
                      : a
                  )
                );
              });
            }
            if (nextRow.status.trim() === "new") {
              playSoftIncomingBeep();
              notifyIncomingIfAllowed(nextRow.from_e164, nextRow.crm_contact_display_name);
            }
            return;
          }
          if (ev === "UPDATE") {
            const row = payload.new;
            if (!isAlertRow(row)) return;
            const raw = toAlertRowWithCrmSlot(row);
            setAlerts((prev) => {
              const idx = prev.findIndex((a) => a.id === raw.id);
              if (idx === -1) {
                const deduped = prev.filter((x) => x.id !== raw.id);
                const sorted = [...deduped, raw].sort(sortAlertsDesc).slice(0, maxVisible);
                if (!raw.crm_contact_display_name && raw.from_e164) {
                  const alertId = raw.id;
                  const from = raw.from_e164;
                  void resolveAlertFromDisplayName(from).then((name) => {
                    if (!name) return;
                    setAlerts((p) =>
                      p.map((a) =>
                        a.id === alertId && a.from_e164 === from ? { ...a, crm_contact_display_name: name } : a
                      )
                    );
                  });
                }
                return sorted;
              }
              const prevRow = prev[idx];
              let crmName: string | null = null;
              if (raw.from_e164 && prevRow.from_e164 === raw.from_e164) {
                crmName = prevRow.crm_contact_display_name ?? null;
              }
              const merged: IncomingCallAlertRow = { ...raw, crm_contact_display_name: crmName };
              const next = [...prev];
              next[idx] = merged;
              const out = next.sort(sortAlertsDesc).slice(0, maxVisible);
              if (!merged.crm_contact_display_name && merged.from_e164) {
                const alertId = merged.id;
                const from = merged.from_e164;
                void resolveAlertFromDisplayName(from).then((name) => {
                  if (!name) return;
                  setAlerts((p) =>
                    p.map((a) =>
                      a.id === alertId && a.from_e164 === from ? { ...a, crm_contact_display_name: name } : a
                    )
                  );
                });
              }
              return out;
            });
            return;
          }
          if (ev === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            if (typeof id !== "string") return;
            setAlerts((prev) => prev.filter((a) => a.id !== id));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [maxVisible]);

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Incoming call alerts</h2>
        <p className="mt-1 text-xs text-slate-500">
          Live ring pipeline (newest {maxVisible}). Updates in real time via Supabase.
        </p>
      </div>
      {alerts.length === 0 ? (
        <p className="px-6 py-6 text-sm text-slate-500">No incoming call alerts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="whitespace-nowrap px-4 py-3">Time</th>
                <th className="whitespace-nowrap px-4 py-3">From</th>
                <th className="whitespace-nowrap px-4 py-3">To</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="whitespace-nowrap px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const st = a.status.trim();
                const rowClass = mounted ? alertRowClasses(st) : NEUTRAL_ROW_CLASS;
                const pillClass = mounted ? followUpPill(st) : NEUTRAL_STATUS_PILL_CLASS;
                return (
                <tr key={a.id} className={rowClass}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatAdminPhoneWhen(a.created_at)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 text-slate-700"
                    title={a.from_e164 ?? undefined}
                  >
                    {a.crm_contact_display_name?.trim() ? (
                      <span className="text-sm">{a.crm_contact_display_name}</span>
                    ) : (
                      <span className="font-mono text-xs">{a.from_e164 ?? "—"}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                    {a.to_e164 ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={pillClass}>{st}</span>
                  </td>
                  <td className="px-4 py-3">
                    {st === "new" || st === "acknowledged" ? (
                      <div className="flex flex-wrap gap-1">
                        {st === "new" ? (
                          <form action={updateIncomingCallAlert}>
                            <input type="hidden" name="alertId" value={a.id} />
                            <input type="hidden" name="intent" value="acknowledge" />
                            <button
                              type="submit"
                              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Ack
                            </button>
                          </form>
                        ) : null}
                        <form action={updateIncomingCallAlert}>
                          <input type="hidden" name="alertId" value={a.id} />
                          <input type="hidden" name="intent" value="resolve" />
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Resolve
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
