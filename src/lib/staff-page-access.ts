import type { StaffProfile, StaffRole } from "@/lib/staff-profile";
import { isManagerOrHigher, isSuperAdmin } from "@/lib/staff-profile";

/**
 * Canonical module keys for Staff Access + mobile workspace. Used in staff_profiles.page_permissions JSON.
 * Values: true = allow, false = deny. Missing key falls back to preset/role defaults.
 */
export const STAFF_PAGE_KEYS = [
  "command_center",
  "contacts",
  "leads",
  "recruiting",
  "facilities",
  "patients",
  "credentialing",
  "call_log",
  "workspace_keypad",
  "dispatch",
  "employees",
  "payroll",
  "billing",
  "staff_access",
  "workspace_inbox",
  "workspace_calls",
  "workspace_voicemail",
  "workspace_followups",
  "workspace_visits",
  "workspace_patients",
  "workspace_pay",
  "workspace_leads",
] as const;

export type StaffPageKey = (typeof STAFF_PAGE_KEYS)[number];

export const STAFF_PAGE_LABELS: Record<StaffPageKey, string> = {
  command_center: "Command Center",
  contacts: "Contacts",
  leads: "Leads",
  recruiting: "Recruiting",
  facilities: "Facilities",
  patients: "Patients (admin)",
  credentialing: "Credentialing",
  call_log: "Call Log",
  workspace_keypad: "Workspace Keypad",
  dispatch: "Dispatch",
  employees: "Employees",
  payroll: "Payroll",
  billing: "Billing",
  staff_access: "Staff Access",
  workspace_inbox: "Inbox (workspace)",
  workspace_calls: "Calls (workspace)",
  workspace_voicemail: "Voicemail (workspace)",
  workspace_followups: "Chat",
  workspace_visits: "Visits (workspace)",
  workspace_patients: "Patients (workspace)",
  workspace_pay: "Pay (workspace)",
  workspace_leads: "Leads (workspace)",
};

export const STAFF_PAGE_PRESETS = [
  "nurse",
  "admin",
  "manager",
  "recruiter",
  "billing",
  "dispatch",
  "credentialing",
  "read_only",
  "custom",
] as const;

export type StaffPagePreset = (typeof STAFF_PAGE_PRESETS)[number];

export function isStaffPageKey(value: string): value is StaffPageKey {
  return (STAFF_PAGE_KEYS as readonly string[]).includes(value);
}

export function isStaffPagePreset(value: string | null | undefined): value is StaffPagePreset {
  if (!value) return false;
  return (STAFF_PAGE_PRESETS as readonly string[]).includes(value);
}

function allFalse(): Record<StaffPageKey, boolean> {
  return Object.fromEntries(STAFF_PAGE_KEYS.map((k) => [k, false])) as Record<StaffPageKey, boolean>;
}

function allWorkspacePhoneTrue(): Record<StaffPageKey, boolean> {
  const b = allFalse();
  b.workspace_keypad = true;
  b.workspace_inbox = true;
  b.workspace_calls = true;
  b.workspace_voicemail = true;
  b.workspace_followups = true;
  b.workspace_visits = true;
  b.workspace_patients = true;
  b.workspace_pay = true;
  b.workspace_leads = false;
  return b;
}

/** Default nurse: phone workspace only (no admin modules) unless toggles grant admin shell. */
function presetNurse(): Record<StaffPageKey, boolean> {
  return allWorkspacePhoneTrue();
}

/** Full admin nav + full workspace (managers often switch). */
function presetManagerLike(): Record<StaffPageKey, boolean> {
  const b = allFalse();
  for (const k of STAFF_PAGE_KEYS) b[k] = true;
  b.workspace_leads = true;
  return b;
}

function presetReadOnly(): Record<StaffPageKey, boolean> {
  const b = allFalse();
  b.command_center = true;
  b.patients = true;
  b.call_log = true;
  b.workspace_keypad = true;
  b.workspace_inbox = true;
  b.workspace_calls = true;
  b.workspace_visits = true;
  b.workspace_patients = true;
  return b;
}

function presetRecruiting(): Record<StaffPageKey, boolean> {
  const b = presetManagerLike();
  b.payroll = false;
  b.billing = false;
  b.dispatch = false;
  return b;
}

function presetBilling(): Record<StaffPageKey, boolean> {
  const b = presetManagerLike();
  b.recruiting = false;
  b.leads = false;
  b.billing = true;
  b.payroll = true;
  return b;
}

function presetDispatch(): Record<StaffPageKey, boolean> {
  const b = presetManagerLike();
  b.recruiting = false;
  b.credentialing = false;
  return b;
}

function presetCredentialing(): Record<StaffPageKey, boolean> {
  const b = presetManagerLike();
  b.recruiting = false;
  b.leads = false;
  return b;
}

export function defaultPagesForPreset(preset: StaffPagePreset): Record<StaffPageKey, boolean> {
  switch (preset) {
    case "nurse":
      return presetNurse();
    case "read_only":
      return presetReadOnly();
    case "recruiter":
      return presetRecruiting();
    case "billing":
      return presetBilling();
    case "dispatch":
      return presetDispatch();
    case "credentialing":
      return presetCredentialing();
    case "admin":
    case "manager":
      return presetManagerLike();
    case "custom":
      return presetManagerLike();
    default:
      return presetManagerLike();
  }
}

export function roleFallbackPreset(role: StaffRole): StaffPagePreset {
  switch (role) {
    case "nurse":
      return "nurse";
    case "read_only":
      return "read_only";
    case "recruiter":
      return "recruiter";
    case "billing":
      return "billing";
    case "dispatch":
      return "dispatch";
    case "credentialing":
      return "credentialing";
    case "super_admin":
    case "admin":
      return "admin";
    case "manager":
    case "don":
      return "manager";
    default:
      return "manager";
  }
}

export type StaffForPageAccess = Pick<
  StaffProfile,
  "role" | "page_access_preset" | "page_permissions" | "admin_shell_access"
>;

function normalizeOverrides(raw: unknown): Partial<Record<StaffPageKey, boolean>> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<Record<StaffPageKey, boolean>> = {};
  for (const key of STAFF_PAGE_KEYS) {
    if (!(key in o)) continue;
    const v = o[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

/**
 * Effective page access: preset (from staff.page_access_preset or role) merged with JSON overrides.
 */
export function resolveEffectivePageAccess(staff: StaffForPageAccess): Record<StaffPageKey, boolean> {
  const presetSlug = isStaffPagePreset(staff.page_access_preset)
    ? staff.page_access_preset
    : roleFallbackPreset(staff.role);
  const base = defaultPagesForPreset(presetSlug);
  const overrides = normalizeOverrides(staff.page_permissions);

  const merged = { ...base };
  for (const k of STAFF_PAGE_KEYS) {
    if (k in overrides) merged[k] = overrides[k]!;
  }

  // Nurses without admin shell: hard-off all /admin modules (workspace tiles still apply).
  if (staff.role === "nurse" && staff.admin_shell_access !== true) {
    merged.command_center = false;
    merged.contacts = false;
    merged.leads = false;
    merged.recruiting = false;
    merged.facilities = false;
    merged.patients = false;
    merged.credentialing = false;
    merged.call_log = false;
    merged.dispatch = false;
    merged.employees = false;
    merged.payroll = false;
    merged.staff_access = false;
  }

  if (isSuperAdmin({ role: staff.role } as StaffProfile)) {
    for (const k of STAFF_PAGE_KEYS) merged[k] = true;
  }

  return merged;
}

/** Admin top-nav ids map to page keys (1:1). */
export function adminNavIdToPageKey(id: string): StaffPageKey | null {
  switch (id) {
    case "command_center":
      return "command_center";
    case "contacts":
      return "contacts";
    case "leads":
      return "leads";
    case "recruiting":
      return "recruiting";
    case "facilities":
      return "facilities";
    case "patients":
      return "patients";
    case "credentialing":
      return "credentialing";
    case "call_log":
      return "call_log";
    case "workspace_keypad":
      return "workspace_keypad";
    case "dispatch":
      return "dispatch";
    case "employees":
      return "employees";
    case "payroll":
      return "payroll";
    case "staff_access":
      return "staff_access";
    default:
      return null;
  }
}

export function workspaceHrefToPageKey(href: string): StaffPageKey | null {
  if (href.startsWith("/workspace/phone/inbox")) return "workspace_inbox";
  if (href.startsWith("/workspace/phone/calls")) return "workspace_calls";
  if (href.startsWith("/workspace/phone/voicemail")) return "workspace_voicemail";
  if (href.startsWith("/workspace/phone/chat")) return "workspace_followups";
  if (href.startsWith("/workspace/phone/visits") || href === "/workspace/phone") return "workspace_visits";
  if (href.startsWith("/workspace/phone/patients")) return "workspace_patients";
  if (href.startsWith("/workspace/phone/keypad")) return "workspace_keypad";
  if (href.startsWith("/workspace/phone/leads")) return "workspace_leads";
  if (href.startsWith("/workspace/pay")) return "workspace_pay";
  return null;
}

const WORKSPACE_TAB_HREFS: { key: StaffPageKey; href: string }[] = [
  { key: "workspace_visits", href: "/workspace/phone/visits" },
  { key: "workspace_followups", href: "/workspace/phone/chat" },
  { key: "workspace_inbox", href: "/workspace/phone/inbox" },
  { key: "workspace_calls", href: "/workspace/phone/calls" },
  { key: "workspace_voicemail", href: "/workspace/phone/voicemail" },
  { key: "workspace_patients", href: "/workspace/phone/patients" },
  { key: "workspace_keypad", href: "/workspace/phone/keypad" },
  { key: "workspace_pay", href: "/workspace/pay" },
  { key: "workspace_leads", href: "/workspace/phone/leads" },
];

export function allowedWorkspaceTabHrefs(access: Record<StaffPageKey, boolean>): string[] | null {
  const allowed = WORKSPACE_TAB_HREFS.filter((t) => access[t.key]).map((t) => t.href);
  if (allowed.length === WORKSPACE_TAB_HREFS.length) return null;
  return allowed;
}

/** When keypad is disallowed by page permissions, avoid sending users to the admin call log. */
export function fallbackPathAfterKeypadDenied(access: Record<StaffPageKey, boolean>): string {
  for (const { key, href } of WORKSPACE_TAB_HREFS) {
    if (key !== "workspace_keypad" && access[key] === true) {
      return href;
    }
  }
  if (access.command_center === true) {
    return "/admin";
  }
  return "/unauthorized?reason=forbidden";
}

export function userCanReachAdminBackend(staff: StaffForPageAccess, access: Record<StaffPageKey, boolean>): boolean {
  if (!isManagerOrHigher({ role: staff.role } as StaffProfile) && staff.role !== "nurse") {
    return true;
  }
  if (staff.role === "nurse" && staff.admin_shell_access !== true) return false;
  return STAFF_PAGE_KEYS.some((k) => {
    if (k.startsWith("workspace_")) return false;
    return access[k] === true;
  });
}
