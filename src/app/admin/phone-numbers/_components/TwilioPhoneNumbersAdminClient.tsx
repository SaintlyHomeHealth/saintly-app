"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

export type TwilioNumberRow = {
  id: string;
  phone_number: string;
  twilio_sid: string;
  label: string | null;
  number_type: string;
  status: string;
  assigned_user_id: string | null;
  assigned_staff_profile_id: string | null;
  is_primary_company_number: boolean;
  is_company_backup_number?: boolean;
  sms_enabled: boolean;
  voice_enabled: boolean;
};

function isCompanySharedInventoryRow(row: TwilioNumberRow): boolean {
  return (
    row.is_primary_company_number ||
    Boolean(row.is_company_backup_number) ||
    row.number_type === "company_shared"
  );
}

export type AssignableStaffOption = {
  user_id: string;
  label: string;
};

async function postJson(url: string, body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok) {
    return { ok: false, error: j.error || res.statusText || "Request failed" };
  }
  return j;
}

export function TwilioPhoneNumbersAdminClient(props: {
  initialNumbers: TwilioNumberRow[];
  assignableStaff: AssignableStaffOption[];
}) {
  const router = useRouter();
  const [numbers, setNumbers] = useState(props.initialNumbers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [buyPn, setBuyPn] = useState("");
  const [buyLabel, setBuyLabel] = useState("");
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const [xferFrom, setXferFrom] = useState("");
  const [xferTo, setXferTo] = useState("");
  const [xferPnId, setXferPnId] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);

  const staffByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of props.assignableStaff) m.set(s.user_id, s.label);
    return m;
  }, [props.assignableStaff]);

  async function refresh() {
    const res = await fetch("/api/admin/twilio/phone-numbers");
    const j = (await res.json()) as { numbers?: TwilioNumberRow[] };
    if (res.ok && Array.isArray(j.numbers)) setNumbers(j.numbers);
    router.refresh();
  }

  async function onAssign(row: TwilioNumberRow, userId: string) {
    setBusyId(row.id);
    const r = await postJson("/api/admin/twilio/phone-numbers/assign", {
      phoneNumberId: row.id,
      assignToUserId: userId,
    });
    setBusyId(null);
    if (!r.ok) {
      alert(r.error ?? "Assign failed");
      return;
    }
    await refresh();
  }

  async function onUnassign(row: TwilioNumberRow) {
    if (
      !window.confirm(
        "This keeps the Twilio number in Saintly's account but removes it from this staff member."
      )
    ) {
      return;
    }
    setBusyId(row.id);
    const r = await postJson("/api/admin/twilio/phone-numbers/unassign", { phoneNumberId: row.id });
    setBusyId(null);
    if (!r.ok) {
      alert(r.error ?? "Unassign failed");
      return;
    }
    await refresh();
  }

  async function onRetire(row: TwilioNumberRow) {
    if (
      !window.confirm(
        "Retiring hides this number in the CRM. It does not automatically release it from Twilio unless a separate release action is built."
      )
    ) {
      return;
    }
    setBusyId(row.id);
    const r = await postJson("/api/admin/twilio/phone-numbers/retire", { phoneNumberId: row.id });
    setBusyId(null);
    if (!r.ok) {
      alert(r.error ?? "Retire failed");
      return;
    }
    await refresh();
  }

  async function onReassign(row: TwilioNumberRow, userId: string) {
    setBusyId(row.id);
    const r = await postJson("/api/admin/twilio/phone-numbers/reassign", {
      phoneNumberId: row.id,
      assignToUserId: userId,
    });
    setBusyId(null);
    if (!r.ok) {
      alert(r.error ?? "Reassign failed");
      return;
    }
    await refresh();
  }

  async function onBuy(e: FormEvent) {
    e.preventDefault();
    setBuyErr(null);
    const r = await postJson("/api/admin/twilio/phone-numbers/buy", {
      phoneNumber: buyPn.trim(),
      label: buyLabel.trim() || undefined,
    });
    if (!r.ok) {
      setBuyErr(r.error ?? "Buy failed");
      return;
    }
    setBuyPn("");
    setBuyLabel("");
    await refresh();
  }

  async function onTransferHistory(e: FormEvent) {
    e.preventDefault();
    const r = await postJson("/api/admin/twilio/phone-numbers/transfer-history", {
      phoneNumberId: xferPnId.trim(),
      fromUserId: xferFrom.trim(),
      toUserId: xferTo.trim(),
    });
    if (!r.ok) {
      alert(r.error ?? "Transfer failed");
      return;
    }
    alert("Historical messages updated where possible.");
    await refresh();
  }

  async function onSyncFromTwilio() {
    setSyncBusy(true);
    try {
      const res = await fetch("/api/admin/twilio/phone-numbers/sync", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        scanned?: number;
        inserted?: number;
        updated?: number;
      };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Sync failed");
        return;
      }
      alert(
        `Twilio sync complete: scanned ${j.scanned ?? 0}, inserted ${j.inserted ?? 0}, updated ${j.updated ?? 0}.`
      );
      await refresh();
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Import existing Twilio numbers</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Pulls Incoming Phone Numbers from your Twilio account into this inventory (no purchase). Numbers{" "}
          <span className="font-mono">+14803600008</span> and <span className="font-mono">+14805712062</span> are
          tagged as company/shared lines when present.
        </p>
        <button
          type="button"
          className="mt-3 rounded bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50"
          disabled={syncBusy}
          onClick={() => void onSyncFromTwilio()}
        >
          {syncBusy ? "Syncing…" : "Sync from Twilio"}
        </button>
      </div>

      <form onSubmit={onBuy} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Buy number (Twilio)</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Requires TWilio credentials and NEXT_PUBLIC_SITE_URL. Webhooks: SMS and voice point at Saintly inbound routes.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <input
            className="min-w-[220px] rounded border border-neutral-300 px-3 py-2 text-sm"
            placeholder="+14805551234"
            value={buyPn}
            onChange={(e) => setBuyPn(e.target.value)}
          />
          <input
            className="min-w-[200px] rounded border border-neutral-300 px-3 py-2 text-sm"
            placeholder="Label (optional)"
            value={buyLabel}
            onChange={(e) => setBuyLabel(e.target.value)}
          />
          <button
            type="submit"
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Purchase &amp; save
          </button>
        </div>
        {buyErr ? <p className="mt-2 text-sm text-rose-600">{buyErr}</p> : null}
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-neutral-700">Number</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-700">Label</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-700">Role</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-700">Assigned</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-700">Status</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-700">SMS</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-700">Voice</th>
              <th className="px-3 py-2 text-left font-medium text-neutral-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {numbers.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.phone_number}</td>
                <td className="px-3 py-2">{row.label ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {row.is_primary_company_number ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900">
                        Primary company
                      </span>
                    ) : null}
                    {row.is_company_backup_number ? (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">
                        Backup shared
                      </span>
                    ) : null}
                    {!row.is_primary_company_number && !row.is_company_backup_number ? (
                      <span className="text-xs text-neutral-600">
                        {row.number_type === "company_shared" ? "Company shared" : row.number_type || "—"}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {row.assigned_user_id
                    ? staffByUserId.get(row.assigned_user_id) ?? row.assigned_user_id.slice(0, 8) + "…"
                    : "—"}
                </td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.sms_enabled ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{row.voice_enabled ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-2">
                    <select
                      className="max-w-[240px] rounded border border-neutral-300 px-2 py-1 text-xs"
                      defaultValue=""
                      disabled={
                        busyId === row.id || row.status === "retired" || isCompanySharedInventoryRow(row)
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        e.target.selectedIndex = 0;
                        if (!v) return;
                        if (row.status === "available") void onAssign(row, v);
                        else if (row.status === "assigned") void onReassign(row, v);
                      }}
                    >
                      <option value="">Assign / Reassign…</option>
                      {props.assignableStaff.map((s) => (
                        <option key={s.user_id} value={s.user_id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
                        disabled={busyId === row.id || row.status !== "assigned"}
                        onClick={() => void onUnassign(row)}
                      >
                        Unassign
                      </button>
                      <button
                        type="button"
                        className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                        disabled={
                          busyId === row.id || row.status === "retired" || isCompanySharedInventoryRow(row)
                        }
                        onClick={() => void onRetire(row)}
                      >
                        Retire
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={onTransferHistory} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
        <h2 className="text-lg font-semibold text-neutral-900">Transfer historical SMS ownership</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Moves existing message rows from one staff user to another for the selected Twilio number (explicit admin action).
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
            value={xferPnId}
            onChange={(e) => setXferPnId(e.target.value)}
            required
          >
            <option value="">Select number…</option>
            {numbers.map((n) => (
              <option key={n.id} value={n.id}>
                {n.phone_number}
              </option>
            ))}
          </select>
          <input
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-mono"
            placeholder="From user UUID"
            value={xferFrom}
            onChange={(e) => setXferFrom(e.target.value)}
            required
          />
          <input
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-mono"
            placeholder="To user UUID"
            value={xferTo}
            onChange={(e) => setXferTo(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="mt-3 rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
        >
          Transfer history
        </button>
      </form>
    </div>
  );
}
