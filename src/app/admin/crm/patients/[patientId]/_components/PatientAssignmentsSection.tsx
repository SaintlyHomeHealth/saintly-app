import {
  assignPatientToStaff,
  deactivatePatientAssignment,
  setPatientPrimaryNurse,
} from "../../../actions";

const CLINICIAN_DISCIPLINES = ["RN", "PT", "OT", "ST", "MSW"] as const;

type StaffOpt = {
  user_id: string;
  email: string | null;
  role: string;
  full_name: string | null;
};

type AsnRow = {
  id: string;
  role: string;
  assigned_user_id: string | null;
  discipline: string | null;
  is_primary: boolean | null;
};

function staffPrimaryLabel(s: StaffOpt): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) {
    const local = em.split("@")[0]?.trim();
    if (local) {
      const words = local.replace(/[._+-]+/g, " ").split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
    }
  }
  return `${s.user_id.slice(0, 8)}…`;
}

function assignmentStaffLabel(
  uid: string,
  staffByUser: Map<string, { full_name: string | null; email: string | null }>
): string {
  const s = staffByUser.get(uid);
  const name = (s?.full_name ?? "").trim();
  if (name) return name;
  const em = (s?.email ?? "").trim();
  if (em) return em;
  return `${uid.slice(0, 8)}…`;
}

function operationalRoleLabel(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === "backup_nurse") return "Backup nurse";
  if (r === "intake") return "Intake";
  if (r === "admin") return "Admin";
  return role.replace(/_/g, " ");
}

const selectCls = "max-w-[18rem] rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800";
const btnCls =
  "rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
const btnPrimaryCls =
  "rounded border border-sky-600 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100";

export function PatientAssignmentsSection({
  patientId,
  staffOptions,
  assignments,
  staffByUser,
}: {
  patientId: string;
  staffOptions: StaffOpt[];
  assignments: AsnRow[];
  staffByUser: Map<string, { full_name: string | null; email: string | null }>;
}) {
  const primaryRow = assignments.find((a) => a.role === "primary_nurse" && a.assigned_user_id);
  const primaryUid = primaryRow?.assigned_user_id ? String(primaryRow.assigned_user_id) : "";

  const clinicianRows = assignments.filter((a) => a.role === "clinician" && a.assigned_user_id);

  const otherRows = assignments.filter(
    (a) => a.assigned_user_id && !["primary_nurse", "clinician"].includes(a.role)
  );

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Assignments</h2>
      <p className="mt-1 text-xs text-slate-500">
        Primary nurse is a single role per chart. Clinicians are stored per discipline; one primary per discipline is allowed.
      </p>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-[11px] font-semibold text-slate-700">Primary nurse</p>
        <form action={setPatientPrimaryNurse} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="patientId" value={patientId} />
          <label className="sr-only" htmlFor={`pn-${patientId}`}>
            Primary nurse
          </label>
          <select
            id={`pn-${patientId}`}
            name="assignedUserId"
            className={selectCls}
            defaultValue={primaryUid}
          >
            <option value="">— Unassigned —</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {staffPrimaryLabel(s)}
              </option>
            ))}
          </select>
          <button type="submit" className={btnPrimaryCls}>
            Save
          </button>
        </form>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-[11px] font-semibold text-slate-700">Assigned clinicians</p>
        {clinicianRows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No clinician assignments yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {clinicianRows.map((a) => {
              const uid = String(a.assigned_user_id);
              const label = assignmentStaffLabel(uid, staffByUser);
              const disc = typeof a.discipline === "string" ? a.discipline.trim() : "";
              const isPrim = a.is_primary === true;
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900">{label}</span>
                    {disc ? (
                      <span className="ml-2 text-xs font-medium text-slate-600">({disc})</span>
                    ) : null}
                    {isPrim ? (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900">
                        Primary
                      </span>
                    ) : null}
                  </div>
                  <form action={deactivatePatientAssignment} className="shrink-0">
                    <input type="hidden" name="assignmentId" value={String(a.id)} />
                    <button type="submit" className={btnCls}>
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-[11px] font-semibold text-slate-700">Add clinician</p>
        <form action={assignPatientToStaff} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="role" value="clinician" />
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-600">
            Staff
            <select name="assignedUserId" required className={selectCls} defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {staffPrimaryLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-600">
            Discipline
            <select name="discipline" required className={selectCls}>
              <option value="">—</option>
              {CLINICIAN_DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[11px] text-slate-700">
            <input type="checkbox" name="isPrimaryClinician" value="1" className="rounded border-slate-300" />
            Primary for this discipline
          </label>
          <button type="submit" className={btnPrimaryCls}>
            Add clinician
          </button>
        </form>
      </div>

      {otherRows.length > 0 ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[11px] font-semibold text-slate-700">Other roles</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Operational assignments (not clinical lines).</p>
          <ul className="mt-2 space-y-2">
            {otherRows.map((a) => {
              const uid = String(a.assigned_user_id);
              const label = assignmentStaffLabel(uid, staffByUser);
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-slate-500">{operationalRoleLabel(a.role)}</span>
                    <span className="ml-2 font-medium text-slate-800">{label}</span>
                  </div>
                  <form action={deactivatePatientAssignment} className="shrink-0">
                    <input type="hidden" name="assignmentId" value={String(a.id)} />
                    <button type="submit" className={btnCls}>
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
