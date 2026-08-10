"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  previewVisitPasteAction,
  recalculatePasteLineRateAction,
  saveVisitPasteImportAction,
  type PasteImportProposedLine,
} from "@/app/admin/payroll/paste/actions";

function money(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type PatientOpt = { id: string; label: string; payerHint: string | null };
type PeriodOpt = { start: string; label: string };

type EditableLine = PasteImportProposedLine & {
  amountInput: string;
};

type Props = {
  selectedWeekStart: string;
  periodOptions: PeriodOpt[];
};

function toEditable(lines: PasteImportProposedLine[]): EditableLine[] {
  return lines.map((l) => ({ ...l, amountInput: String(l.amount) }));
}

export function PasteVisitImportClient({ selectedWeekStart, periodOptions }: Props) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(selectedWeekStart);
  const [pasteText, setPasteText] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [patientOptions, setPatientOptions] = useState<PatientOpt[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skippedIncomplete, setSkippedIncomplete] = useState(0);
  const [periodLabel, setPeriodLabel] = useState<{ start: string; end: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const included = useMemo(() => lines.filter((l) => !l.skip), [lines]);

  const totalsByRn = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const l of included) {
      const key = l.employeeId || l.clinicianName;
      const name = l.employeeName || l.clinicianName;
      const prev = map.get(key) ?? { name, total: 0, count: 0 };
      prev.total += Number(l.amount) || 0;
      prev.count += 1;
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [included]);

  const grandTotal = totalsByRn.reduce((s, r) => s + r.total, 0);

  const updateLine = (rowKey: string, patch: Partial<EditableLine>) => {
    setLines((prev) => prev.map((l) => (l.rowKey === rowKey ? { ...l, ...patch } : l)));
  };

  const handleParse = () => {
    setError(null);
    setSaveMessage(null);
    startTransition(async () => {
      const res = await previewVisitPasteAction({ pasteText, weekStart });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLines(toEditable(res.lines));
      setPatientOptions(res.patientOptions);
      setWarnings(res.warnings);
      setSkippedIncomplete(res.skippedIncomplete);
      setPeriodLabel({ start: res.payPeriodStart, end: res.payPeriodEnd });
    });
  };

  const handleLineTypeChange = (line: EditableLine, lineType: "visit" | "soc") => {
    if (!line.employeeId) {
      updateLine(line.rowKey, { lineType, skip: true, blockReason: line.blockReason });
      return;
    }

    startTransition(async () => {
      const res = await recalculatePasteLineRateAction({
        employeeId: line.employeeId!,
        serviceDate: line.serviceDate,
        lineType,
        payerHint: line.payerHint,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }

      const needsPatient = !line.patientId;
      const already = line.alreadyImported;
      const outside = !line.inPayPeriod;
      let blockReason: string | null = null;
      if (already) blockReason = "Already imported / paid";
      else if (outside) blockReason = "Outside selected pay week";
      else if (needsPatient) blockReason = "Patient not matched — select a patient before save";
      else if (res.rateSource === "missing") blockReason = "Agreement has no usable visit rate";

      updateLine(line.rowKey, {
        lineType,
        amount: res.amount,
        amountInput: String(res.amount),
        rateSource: res.rateSource,
        appliedTangoOverride: res.appliedTangoOverride,
        blockReason,
        skip: Boolean(blockReason),
      });
    });
  };

  const handlePatientSelect = (line: EditableLine, patientId: string) => {
    const opt = patientOptions.find((p) => p.id === patientId) ?? null;
    const payerHint = opt?.payerHint ?? null;

    const apply = (amount: number, rateSource: string, appliedTangoOverride: boolean) => {
      const already = line.alreadyImported;
      const outside = !line.inPayPeriod;
      let blockReason: string | null = null;
      if (!line.employeeId) blockReason = "Clinician not matched to an employee";
      else if (already) blockReason = "Already imported / paid";
      else if (outside) blockReason = "Outside selected pay week";
      else if (!patientId) blockReason = "Patient not matched — select a patient before save";
      else if (rateSource === "missing") blockReason = "Agreement has no usable visit rate";

      updateLine(line.rowKey, {
        patientId: patientId || null,
        patientLabel: opt?.label ?? null,
        payerHint,
        amount,
        amountInput: String(amount),
        rateSource,
        appliedTangoOverride,
        blockReason,
        skip: Boolean(blockReason),
      });
    };

    if (!line.employeeId || !patientId) {
      apply(line.amount, line.rateSource, line.appliedTangoOverride);
      return;
    }

    startTransition(async () => {
      const res = await recalculatePasteLineRateAction({
        employeeId: line.employeeId!,
        serviceDate: line.serviceDate,
        lineType: line.lineType,
        payerHint,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      apply(res.amount, res.rateSource, res.appliedTangoOverride);
    });
  };

  const handleSave = () => {
    setError(null);
    setSaveMessage(null);

    const toSave = included.filter((l) => l.employeeId && l.patientId);
    if (!toSave.length) {
      setError("No includable lines with matched clinician and patient.");
      return;
    }

    startTransition(async () => {
      const res = await saveVisitPasteImportAction({
        weekStart,
        lines: toSave.map((l) => ({
          employeeId: l.employeeId!,
          patientId: l.patientId!,
          patientName: l.patientName,
          serviceDate: l.serviceDate,
          lineType: l.lineType,
          amount: Number(l.amountInput || l.amount) || 0,
          notes: l.appliedTangoOverride ? "Paste import · Tango rate" : undefined,
        })),
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      setSaveMessage(
        `Saved ${res.inserted} visit${res.inserted === 1 ? "" : "s"}` +
          (res.skipped ? ` · skipped ${res.skipped}` : "") +
          "."
      );
      if (res.errors.length) {
        setWarnings(res.errors.slice(0, 12));
      }

      // Refresh preview so fingerprints show as already imported
      const preview = await previewVisitPasteAction({ pasteText, weekStart });
      if (preview.ok) {
        setLines(toEditable(preview.lines));
        setPatientOptions(preview.patientOptions);
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              EMR paste
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Import completed visits</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Paste patient visit lists (patient name on its own line, then date / clinician /
              Completed). Pay uses each RN agreement. Tango override applies only when that RN has
              a Tango rate set on their contract.
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Pay week
            </label>
            <select
              value={weekStart}
              onChange={(e) => {
                const v = e.target.value;
                setWeekStart(v);
                router.replace(v ? `/admin/payroll/paste?week=${encodeURIComponent(v)}` : "/admin/payroll/paste");
              }}
              className="mt-1.5 min-w-[240px] rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900"
            >
              {periodOptions.map((o) => (
                <option key={o.start} value={o.start}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={12}
          placeholder={`WILSON, MARYKAY\n08/04/2026\tHULBERT, TIMOTHY\tCompleted\tYes\tYes\tYes\tYes\n07/31/2026\tMCBERTY, VICTORIA\tCompleted\tYes\tYes\tYes\tYes`}
          className="mt-5 w-full rounded-2xl border border-slate-300 bg-slate-50/60 px-4 py-3 font-mono text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleParse}
            disabled={pending || !pasteText.trim()}
            className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Working…" : "Parse visits"}
          </button>
          <Link href="/admin/payroll" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Back to payroll
          </Link>
          {periodLabel ? (
            <span className="text-xs text-slate-500">
              Week {periodLabel.start} → {periodLabel.end}
              {skippedIncomplete ? ` · skipped ${skippedIncomplete} incomplete` : ""}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {saveMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {saveMessage}
        </div>
      ) : null}
      {warnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Notes</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.slice(0, 10).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
          <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Include</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Patient</th>
                  <th className="px-3 py-3">Clinician</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.rowKey}
                    className={`border-b border-slate-100 ${line.skip ? "bg-slate-50/80 text-slate-500" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!line.skip}
                        disabled={
                          !line.employeeId ||
                          line.alreadyImported ||
                          !line.inPayPeriod ||
                          (!line.patientId && !patientOptions.length)
                        }
                        onChange={(e) => {
                          const include = e.target.checked;
                          if (include && !line.patientId) {
                            updateLine(line.rowKey, {
                              skip: true,
                              blockReason: "Patient not matched — select a patient before save",
                            });
                            return;
                          }
                          updateLine(line.rowKey, {
                            skip: !include,
                            blockReason: include ? null : line.blockReason || "Skipped",
                          });
                        }}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                      {line.serviceDate}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{line.patientName}</div>
                      <select
                        value={line.patientId || ""}
                        onChange={(e) => handlePatientSelect(line, e.target.value)}
                        className="mt-1 w-full min-w-[160px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        <option value="">Select patient…</option>
                        {patientOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                            {p.payerHint ? ` · ${p.payerHint}` : ""}
                          </option>
                        ))}
                      </select>
                      {line.payerHint ? (
                        <p className="mt-1 text-[11px] text-slate-500">Payer: {line.payerHint}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{line.clinicianName}</div>
                      <div className="text-xs text-slate-500">
                        {line.employeeName ? `Matched: ${line.employeeName}` : "Not matched"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={line.lineType}
                        onChange={(e) =>
                          handleLineTypeChange(line, e.target.value === "soc" ? "soc" : "visit")
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        <option value="visit">Visit</option>
                        <option value="soc">SOC</option>
                      </select>
                      {line.appliedTangoOverride ? (
                        <p className="mt-1 text-[11px] font-semibold text-violet-700">Tango rate</p>
                      ) : (
                        <p className="mt-1 text-[11px] text-slate-500">{line.rateSource}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.amountInput}
                        onChange={(e) => {
                          const v = e.target.value;
                          const n = Number(v);
                          updateLine(line.rowKey, {
                            amountInput: v,
                            amount: Number.isFinite(n) ? n : line.amount,
                          });
                        }}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm font-medium"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {line.blockReason ? (
                        <span className="font-medium text-amber-800">{line.blockReason}</span>
                      ) : (
                        <span className="font-medium text-emerald-700">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="h-fit rounded-[24px] border border-sky-100 bg-sky-50/40 p-5 shadow-sm xl:sticky xl:top-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800/80">
              Owed this import
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{money(grandTotal)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {included.length} visit{included.length === 1 ? "" : "s"} included
            </p>
            <ul className="mt-4 space-y-2">
              {totalsByRn.map((r) => (
                <li key={r.name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">
                    {r.name}
                    <span className="ml-1 text-xs font-normal text-slate-500">({r.count})</span>
                  </span>
                  <span className="font-semibold text-slate-900">{money(r.total)}</span>
                </li>
              ))}
              {totalsByRn.length === 0 ? (
                <li className="text-sm text-slate-500">No lines included yet.</li>
              ) : null}
            </ul>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || included.length === 0}
              className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save to payroll week"}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Saves into each RN&apos;s weekly invoice for the selected pay week. Same visit cannot
              be paid twice.
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
