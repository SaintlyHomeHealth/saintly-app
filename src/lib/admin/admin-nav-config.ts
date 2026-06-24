import { adminNavIdToPageKey, resolveEffectivePageAccess } from "@/lib/staff-page-access";
import type { StaffProfile } from "@/lib/staff-profile";
import {
  canUseWorkspacePhoneAppShell,
  isAdminOrHigher,
  isCrmLeadsRowPolicyRole,
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
  tasks: "Tasks",
  recruiting: "Recruiting",
  recruitingLeads: "Recruiting Leads",
  ptColdCalling: "PT Cold Calling",
  facilities: "Facilities",
  faxCenter: "Fax Center",
  emailMarketing: "Email & Marketing",
  pdfSign: "PDF Sign",
  patients: "Patients",
  credentialing: "Credentialing",
  callLog: "Call Log",
  workspaceKeypad: "Workspace Keypad",
  dispatch: "Dispatch",
  employees: "Employees",
  payroll: "Payroll",
  privatePay: "Private Pay",
  staffAccess: "Staff Access",
  phoneNumbers: "Phone numbers",
  salesAgentChat: "Sales Agent Chat",
} as const;

export type AdminNavItemId =
  | "command_center"
  | "contacts"
  | "leads"
  | "crm_tasks"
  | "recruiting"
  | "recruiting_leads"
  | "pt_cold_calling"
  | "facilities"
  | "fax_center"
  | "email_marketing"
  | "pdf_sign"
  | "patients"
  | "credentialing"
  | "call_log"
  | "workspace_keypad"
  | "dispatch"
  | "employees"
  | "payroll"
  | "private_pay"
  | "staff_access"
  | "phone_numbers"
  | "sales_agent_chat";

export type AdminNavItemResolved = {
  id: AdminNavItemId;
  label: string;
  href: string;
  disabled: boolean;
  disabledReason?: string;
};

function gatePage(
  staff: StaffProfile,
  id: AdminNavItemId,
  access: ReturnType<typeof resolveEffectivePageAccess>,
  baseDisabled: boolean,
  baseReason: string
): { disabled: boolean; disabledReason?: string } {
  const key = adminNavIdToPageKey(id);
  if (key && access[key] !== true) {
    return { disabled: true, disabledReason: "Not enabled for this staff member in Staff Access" };
  }
  if (baseDisabled) return { disabled: true, disabledReason: baseReason };
  return { disabled: false };
}

/**
 * Builds the top admin nav for the signed-in staff member. Disabled items are shown muted with a title tooltip.
 */
export function buildAdminNavItems(staff: StaffProfile | null): AdminNavItemResolved[] {
  if (!staff) return [];

  const access = resolveEffectivePageAccess(staff);
  const admin = isAdminOrHigher(staff);
  const phone = isPhoneWorkspaceUser(staff);
  const workspaceShell = canUseWorkspacePhoneAppShell(staff);
  const nurse = staff.role === "nurse";

  const patientsHref = nurse ? "/workspace/phone/patients" : "/admin/crm/patients";
  const callLogHref = nurse ? "/workspace/phone" : "/admin/phone";

  const g = (id: AdminNavItemId, base: boolean, reason: string) => gatePage(staff, id, access, base, reason);

  return [
    {
      id: "command_center",
      label: ADMIN_NAV_LABELS.commandCenter,
      href: "/admin",
      ...g("command_center", false, ""),
    },
    {
      id: "contacts",
      label: ADMIN_NAV_LABELS.contacts,
      href: "/admin/crm/contacts",
      ...g("contacts", false, ""),
    },
    {
      id: "leads",
      label: ADMIN_NAV_LABELS.leads,
      href: "/admin/crm/leads",
      ...g("leads", false, ""),
    },
    ...(isManagerOrHigher(staff)
      ? [
          {
            id: "sales_agent_chat" as const,
            label: ADMIN_NAV_LABELS.salesAgentChat,
            href: "/admin/sales-agent-chat",
            ...g("sales_agent_chat", false, ""),
          },
        ]
      : []),
    {
      id: "crm_tasks",
      label: ADMIN_NAV_LABELS.tasks,
      href: "/admin/crm/tasks",
      ...g("crm_tasks", false, ""),
    },
    {
      id: "recruiting",
      label: ADMIN_NAV_LABELS.recruiting,
      href: "/admin/recruiting",
      ...g("recruiting", false, ""),
    },
    {
      id: "pt_cold_calling",
      label: ADMIN_NAV_LABELS.ptColdCalling,
      href: "/admin/recruiting/pt-cold-calling",
      ...g("pt_cold_calling", false, ""),
    },
    {
      id: "facilities",
      label: ADMIN_NAV_LABELS.facilities,
      href: "/admin/facilities",
      ...g("facilities", false, ""),
    },
    {
      id: "fax_center",
      label: ADMIN_NAV_LABELS.faxCenter,
      href: "/admin/fax",
      ...g("fax_center", false, ""),
    },
    {
      id: "email_marketing",
      label: ADMIN_NAV_LABELS.emailMarketing,
      href: "/admin/email-marketing",
      ...g("email_marketing", false, ""),
    },
    {
      id: "pdf_sign",
      label: ADMIN_NAV_LABELS.pdfSign,
      href: "/admin/signatures",
      ...g("pdf_sign", false, ""),
    },
    {
      id: "patients",
      label: ADMIN_NAV_LABELS.patients,
      href: patientsHref,
      ...(nurse
        ? {
            disabled: !workspaceShell || access.workspace_patients !== true,
            disabledReason: !workspaceShell
              ? "Workspace phone app required"
              : "Not enabled in Staff Access",
          }
        : g("patients", false, "")),
    },
    {
      id: "credentialing",
      label: ADMIN_NAV_LABELS.credentialing,
      href: "/admin/credentialing",
      ...g("credentialing", false, ""),
    },
    {
      id: "call_log",
      label: ADMIN_NAV_LABELS.callLog,
      href: callLogHref,
      ...(nurse
        ? {
            disabled: !phone || access.workspace_calls !== true,
            disabledReason: !phone
              ? "Phone workspace access required"
              : "Not enabled in Staff Access",
          }
        : g("call_log", !phone, "Phone workspace access required")),
    },
    {
      id: "workspace_keypad",
      label: ADMIN_NAV_LABELS.workspaceKeypad,
      href: "/workspace/phone/keypad",
      ...g("workspace_keypad", !workspaceShell, "Workspace phone app required"),
    },
    {
      id: "dispatch",
      label: ADMIN_NAV_LABELS.dispatch,
      href: "/admin/crm/dispatch",
      ...g("dispatch", false, ""),
    },
    {
      id: "employees",
      label: ADMIN_NAV_LABELS.employees,
      href: "/admin/employees",
      ...g("employees", false, ""),
    },
    {
      id: "payroll",
      label: ADMIN_NAV_LABELS.payroll,
      href: "/admin/payroll",
      ...g("payroll", false, ""),
    },
    ...(isCrmLeadsRowPolicyRole(staff)
      ? [
          {
            id: "private_pay" as const,
            label: ADMIN_NAV_LABELS.privatePay,
            href: "/admin/private-pay",
            disabled: false,
          },
        ]
      : []),
    ...(admin
      ? [
          {
            id: "phone_numbers" as const,
            label: ADMIN_NAV_LABELS.phoneNumbers,
            href: "/admin/phone-numbers",
            disabled: false,
          },
          {
            id: "staff_access" as const,
            label: ADMIN_NAV_LABELS.staffAccess,
            href: "/admin/staff",
            ...g("staff_access", false, ""),
          },
        ]
      : []),
  ];
}
