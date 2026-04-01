import { setPatientVisitStatus } from "@/app/admin/crm/actions";
import { allowedNextVisitStatuses, formatVisitStatusLabel } from "@/lib/crm/patient-visit-status";

const selectCls = "rounded border border-slate-200 px-2 py-1 text-xs text-slate-800";

type Props = {
  visitId: string;
  currentStatus: string;
  /** Where to return after en_route redirect (query params for SMS result). */
  returnTo: string;
};

export function CrmVisitStatusForm({ visitId, currentStatus, returnTo }: Props) {
  const next = allowedNextVisitStatuses(currentStatus);
  if (next.length === 0) {
    return <span className="text-[11px] text-slate-500">No status changes</span>;
  }

  return (
    <form action={setPatientVisitStatus} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <select name="nextStatus" className={selectCls} required defaultValue="">
        <option value="" disabled>
          Update status…
        </option>
        {next.map((s) => (
          <option key={s} value={s}>
            {formatVisitStatusLabel(s)}
          </option>
        ))}
      </select>
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
        <input type="checkbox" name="sendSms" value="1" className="rounded border-slate-300" />
        Send on-my-way SMS if moving to En route
      </label>
      <button
        type="submit"
        className="rounded border border-sky-600 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
      >
        Apply
      </button>
    </form>
  );
}
