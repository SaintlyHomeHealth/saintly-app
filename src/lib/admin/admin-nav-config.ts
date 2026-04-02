import type { StaffProfile } from "@/lib/staff-profile";
import {
  canAccessWorkspacePhone,
  isAdminOrHigher,
  isManagerOrHigher,
  isPhoneWorkspaceUser,
} from "@/lib/staff-profile";

/**
 * Canonical admin nav labels — use these (or `buildAdminNavItems`) so UI stays consistent.
 */
export const ADMIN_NAV_LABELS = {
  commandCenter: "Command Center",
  contacts: "Contacts",
  leads: "Leads",
  patients: "Patients",
  credentialing: "Credentialing",
  callLog: "Call Log",
  workspaceKeypad: "Workspace Keypad",
  dispatch: "Dispatch",
  employees: "Employees",
  staffAccess: "Staff Access",
} as const;

export type AdminNavItemId =
  | "command_center"
  | "contacts"
  | "leads"
  | "patients"
  | "credentialing"
  | "call_log"
  | "workspace_keypad"
  | "dispatch"
  | "employees"
  | "staff_access";

export type AdminNavItemResolved = {
  id: AdminNavItemId;
  label: string;
  href: string;
  disabled: boolean;
  disabledReason?: string;
};

/**
 * Builds the top admin nav for the signed-in staff member. Disabled items are shown muted with a title tooltip.
 */
export function buildAdminNavItems(staff: StaffProfile | null): AdminNavItemResolved[] {
  if (!staff) return [];

  const mgr = isManagerOrHigher(staff);
  const admin = isAdminOrHigher(staff);
  const phone = isPhoneWorkspaceUser(staff);
  const workspacePhone = canAccessWorkspacePhone(staff);
  const nurse = staff.role === "nurse";

  const patientsHref = nurse ? "/workspace/phone/patients" : "/admin/crm/patients";
  const callLogHref = nurse ? "/workspace/phone" : "/admin/phone";

  const managerOnly = !mgr;
  const patientsDisabled = managerOnly && !nurse;

  return [
    { id: "command_center", label: ADMIN_NAV_LABELS.commandCenter, href: "/admin", disabled: false },
    {
      id: "contacts",
      label: ADMIN_NAV_LABELS.contacts,
      href: "/admin/crm/contacts",
      disabled: managerOnly,
      disabledReason: "Manager access required",
    },
    {
      id: "leads",
      label: ADMIN_NAV_LABELS.leads,
      href: "/admin/crm/leads",
      disabled: managerOnly,
      disabledReason: "Manager access required",
    },
    {
      id: "patients",
      label: ADMIN_NAV_LABELS.patients,
      href: patientsHref,
      disabled: patientsDisabled,
      disabledReason: "Manager access required",
    },
    {
      id: "credentialing",
      label: ADMIN_NAV_LABELS.credentialing,
      href: "/admin/credentialing",
      disabled: managerOnly,
      disabledReason: "Manager access required",
    },
    {
      id: "call_log",
      label: ADMIN_NAV_LABELS.callLog,
      href: callLogHref,
      disabled: !phone,
      disabledReason: "Phone workspace access required",
    },
    {
      id: "workspace_keypad",
      label: ADMIN_NAV_LABELS.workspaceKeypad,
      href: "/workspace/phone/keypad",
      disabled: !workspacePhone,
      disabledReason: "Workspace phone access required",
    },
    {
      id: "dispatch",
      label: ADMIN_NAV_LABELS.dispatch,
      href: "/admin/crm/dispatch",
      disabled: managerOnly,
      disabledReason: "Manager access required",
    },
    {
      id: "employees",
      label: ADMIN_NAV_LABELS.employees,
      href: "/admin/employees",
      disabled: managerOnly,
      disabledReason: "Manager access required",
    },
    ...(admin
      ? [
          {
            id: "staff_access" as const,
            label: ADMIN_NAV_LABELS.staffAccess,
            href: "/admin/staff",
            disabled: false,
          },
        ]
      : []),
  ];
}
