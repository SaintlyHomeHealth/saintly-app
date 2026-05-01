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

export type TransferStaffPickOption = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  /** False when deactivated; included in "from" list for historical transfers. */
  is_active: boolean;
};

function formatStaffOptionLabel(s: TransferStaffPickOption): string {
  const name = (s.full_name ?? "").trim();
  const email = (s.email ?? "").trim();
  const primary = name || email || "Staff member";
  const inactive = s.is_active === false ? " [inactive]" : "";
  if (name && email) {
    return `${primary}${inactive} · ${email}`;
  }
  return `${primary}${inactive}`;
}

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
  transferFromStaff: TransferStaffPickOption[];
  transferToStaff: TransferStaffPickOption[];
}) {
  const router = useRouter();
  const [numbers, setNumbers] = useState(props.initialNumbers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [buyPn, setBuyPn] = useState("");
  const [buyLabel, setBuyLabel] = useState("");
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const [xferFromUserId, setXferFromUserId] = useState("");
  const [xferToUserId, setXferToUserId] = useState("");
  const [xferPnId, setXferPnId] = useState("");
  const [xferErr, setXferErr] = useState<string | null>(null);
  const [xferSuccess, setXferSuccess] = useState<string | null>(null);
  const [xferBusy, setXferBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const [searchAreaCode, setSearchAreaCode] = useState("480");
  const [searchContains, setSearchContains] = useState("");
  const [searchLocality, setSearchLocality] = useState("");
  const [searchRegion, setSearchRegion] = useState("");
  const [searchSms, setSearchSms] = useState(true);
  const [searchVoice, setSearchVoice] = useState(true);
  const [searchMms, setSearchMms] = useState(false);
  const [searchNumberType, setSearchNumberType] = useState<"local" | "toll_free">("local");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<
    {
      phone_number: string;
      national_display: string;
      locality: string | null;
      region: string | null;
      postal_code: string | null;
      capabilities: { voice: boolean; sms: boolean; mms: boolean };
      type: "local" | "toll_free";
    }[]
  >([]);
  const [searchLabels, setSearchLabels] = useState<Record<string, string>>({});
  const [purchaseBusyPhone, setPurchaseBusyPhone] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);

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
    setXferErr(null);
    setXferSuccess(null);

    const pnId = xferPnId.trim();
    const fromId = xferFromUserId.trim();
    const toId = xferToUserId.trim();

    if (!pnId) {
      setXferErr("Select the Twilio number to transfer history for.");
      return;
    }
    if (!fromId) {
      setXferErr("Select transfer from staff.");
      return;
    }
    if (!toId) {
      setXferErr("Select transfer to staff.");
      return;
    }
    if (fromId === toId) {
      setXferErr("Transfer from and transfer to must be different staff members.");
      return;
    }

    setXferBusy(true);
    try {
      const res = await fetch("/api/admin/twilio/phone-numbers/transfer-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: pnId,
          fromUserId: fromId,
          toUserId: toId,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        updatedCount?: number;
      };
      if (!res.ok || !j.ok) {
        setXferErr(j.error ?? "Transfer failed. Try again.");
        return;
      }
      const n = typeof j.updatedCount === "number" ? j.updatedCount : 0;
      setXferSuccess(
        n === 0
          ? "Transfer completed. No message rows matched (they may already belong to the target staff or there was no history for that number)."
          : `Transfer completed. Updated ${n} message${n === 1 ? "" : "s"}.`
      );
      setXferFromUserId("");
      setXferToUserId("");
      await refresh();
    } finally {
      setXferBusy(false);
    }
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

  async function onSearchTwilioNumbers(e: FormEvent) {
    e.preventDefault();
    setSearchErr(null);
    setSearchNotice(null);
    if (!searchSms && !searchVoice && !searchMms) {
      setSearchErr("Select at least one capability (SMS, Voice, or MMS).");
      return;
    }
    setSearchBusy(true);
    try {
      const res = await fetch("/api/admin/twilio/phone-numbers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaCode: searchAreaCode.trim(),
          contains: searchContains.trim() || undefined,
          locality: searchLocality.trim() || undefined,
          region: searchRegion.trim() || undefined,
          requireSms: searchSms,
          requireVoice: searchVoice,
          requireMms: searchMms,
          numberType: searchNumberType,
          limit: 35,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        numbers?: typeof searchResults;
      };
      if (!res.ok || !j.ok || !Array.isArray(j.numbers)) {
        setSearchErr(j.error || "Search failed");
        setSearchResults([]);
        return;
      }
      setSearchResults(j.numbers);
      if (j.numbers.length === 0) {
        setSearchNotice("No numbers matched. Try another area code or loosen filters.");
      }
    } finally {
      setSearchBusy(false);
    }
  }

  async function onPurchaseSearchResult(phoneNumber: string) {
    setSearchErr(null);
    setSearchNotice(null);
    setPurchaseBusyPhone(phoneNumber);
    try {
      const label = (searchLabels[phoneNumber] ?? "").trim() || null;
      const res = await fetch("/api/admin/twilio/phone-numbers/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, label: label ?? undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        phoneNumber?: string;
      };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Purchase failed");
        return;
      }
      alert(`Number purchased and saved: ${j.phoneNumber ?? phoneNumber}`);
      setSearchResults((prev) => prev.filter((r) => r.phone_number !== phoneNumber));
      await refresh();
    } finally {
      setPurchaseBusyPhone(null);
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

      <form
        onSubmit={onSearchTwilioNumbers}
        className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-neutral-900">Search available Twilio numbers</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Search Twilio&apos;s inventory (US). Defaults favor Arizona markets (480, 602, 623). Purchases use the same
          SMS/voice webhooks as manual buy.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
            Area code (local)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-sm font-mono"
              placeholder="480"
              value={searchAreaCode}
              onChange={(e) => setSearchAreaCode(e.target.value)}
              disabled={searchNumberType !== "local"}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
            Contains digits (optional)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-sm font-mono"
              placeholder="e.g. 555"
              value={searchContains}
              onChange={(e) => setSearchContains(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
            Locality (optional)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Phoenix"
              value={searchLocality}
              onChange={(e) => setSearchLocality(e.target.value)}
              disabled={searchNumberType !== "local"}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
            Region / state (optional)
            <input
              className="rounded border border-neutral-300 px-3 py-2 text-sm uppercase"
              placeholder="AZ"
              maxLength={2}
              value={searchRegion}
              onChange={(e) => setSearchRegion(e.target.value)}
              disabled={searchNumberType !== "local"}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input type="checkbox" checked={searchSms} onChange={(e) => setSearchSms(e.target.checked)} />
            SMS
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input type="checkbox" checked={searchVoice} onChange={(e) => setSearchVoice(e.target.checked)} />
            Voice
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input type="checkbox" checked={searchMms} onChange={(e) => setSearchMms(e.target.checked)} />
            MMS
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            Number type
            <select
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
              value={searchNumberType}
              onChange={(e) => setSearchNumberType(e.target.value === "toll_free" ? "toll_free" : "local")}
            >
              <option value="local">Local</option>
              <option value="toll_free">Toll-free</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={searchBusy}
            className="rounded bg-violet-800 px-4 py-2 text-sm font-medium text-white hover:bg-violet-900 disabled:opacity-50"
          >
            {searchBusy ? "Searching…" : "Search numbers"}
          </button>
          <span className="self-center text-xs text-neutral-600">
            Quick area codes:{" "}
            <button
              type="button"
              className="text-violet-800 underline"
              onClick={() => setSearchAreaCode("480")}
            >
              480
            </button>
            {", "}
            <button type="button" className="text-violet-800 underline" onClick={() => setSearchAreaCode("602")}>
              602
            </button>
            {", "}
            <button type="button" className="text-violet-800 underline" onClick={() => setSearchAreaCode("623")}>
              623
            </button>
          </span>
        </div>
        {searchErr ? <p className="mt-2 text-sm text-rose-600">{searchErr}</p> : null}
        {searchNotice ? <p className="mt-2 text-sm text-amber-800">{searchNotice}</p> : null}
      </form>

      {searchResults.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-violet-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-violet-100 text-sm">
            <thead className="bg-violet-50/80">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-neutral-700">Number</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-700">Location</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-700">Type</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-700">SMS</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-700">Voice</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-700">MMS</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-700">Label</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {searchResults.map((row) => (
                <tr key={row.phone_number}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    <div>{row.phone_number}</div>
                    <div className="text-neutral-500">{row.national_display}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-800">
                    {[row.locality, row.region].filter(Boolean).join(", ") || "—"}
                    {row.postal_code ? ` · ${row.postal_code}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.type === "toll_free" ? "Toll-free" : "Local"}</td>
                  <td className="px-3 py-2">{row.capabilities.sms ? "Yes" : "—"}</td>
                  <td className="px-3 py-2">{row.capabilities.voice ? "Yes" : "—"}</td>
                  <td className="px-3 py-2">{row.capabilities.mms ? "Yes" : "—"}</td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full min-w-[120px] rounded border border-neutral-300 px-2 py-1 text-xs"
                      placeholder="Optional"
                      value={searchLabels[row.phone_number] ?? ""}
                      onChange={(e) =>
                        setSearchLabels((prev) => ({ ...prev, [row.phone_number]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                      disabled={purchaseBusyPhone !== null}
                      onClick={() => void onPurchaseSearchResult(row.phone_number)}
                    >
                      {purchaseBusyPhone === row.phone_number ? "Buying…" : "Buy & Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

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

      <details className="rounded-lg border border-amber-200 bg-amber-50/40 shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-3 text-base font-semibold text-neutral-900 hover:bg-amber-50/80">
          Advanced: Transfer historical SMS ownership
        </summary>
        <form onSubmit={onTransferHistory} className="border-t border-amber-200/80 px-4 pb-4 pt-3">
          <p className="text-sm font-medium text-amber-950">
            This changes ownership of existing SMS history for the selected number. Use only when intentionally moving
            old conversations from one staff member to another.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-800">
              Twilio number
              <select
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
                value={xferPnId}
                onChange={(e) => {
                  setXferPnId(e.target.value);
                  setXferErr(null);
                  setXferSuccess(null);
                }}
              >
                <option value="">Select number…</option>
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.phone_number}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-800">
              Transfer from staff
              <select
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
                value={xferFromUserId}
                onChange={(e) => {
                  setXferFromUserId(e.target.value);
                  setXferErr(null);
                  setXferSuccess(null);
                }}
              >
                <option value="">Choose staff…</option>
                {props.transferFromStaff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {formatStaffOptionLabel(s)}
                  </option>
                ))}
              </select>
              <span className="font-normal text-neutral-600">Includes inactive accounts for former employees.</span>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-800">
              Transfer to staff
              <select
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
                value={xferToUserId}
                onChange={(e) => {
                  setXferToUserId(e.target.value);
                  setXferErr(null);
                  setXferSuccess(null);
                }}
              >
                <option value="">Choose staff…</option>
                {props.transferToStaff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {formatStaffOptionLabel(s)}
                  </option>
                ))}
              </select>
              <span className="font-normal text-neutral-600">Active staff with a linked login only.</span>
            </label>
          </div>
          {xferErr ? <p className="mt-3 text-sm text-rose-700">{xferErr}</p> : null}
          {xferSuccess ? <p className="mt-3 text-sm text-emerald-800">{xferSuccess}</p> : null}
          <button
            type="submit"
            disabled={xferBusy}
            className="mt-4 rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {xferBusy ? "Transferring…" : "Transfer history"}
          </button>
        </form>
      </details>
    </div>
  );
}
