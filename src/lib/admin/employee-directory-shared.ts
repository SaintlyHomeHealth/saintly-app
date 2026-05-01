/** Shared employee directory types/constants — safe for client + server (no `server-only`, no Supabase). */

export type EmployeeDirectorySegment =
  | "all"
  | "active"
  | "inactive"
  | "in_process"
  | "due_soon"
  | "missing_credentials"
  | "expired"
  | "annuals_due"
  | "ready_to_activate"
  | "activation_blocked";

export type EmployeeDirectorySortKey = "name" | "status" | "updated" | "readiness" | "flags";
export type EmployeeDirectorySortDir = "asc" | "desc";

/** List page: cap how many applicants we enrich (compliance joins scale with this). */
export const EMPLOYEE_DIRECTORY_LIST_MAX_APPLICANTS = 800;
/** Default cap for bulk SMS / cron when loading the directory on the server. */
export const EMPLOYEE_DIRECTORY_FULL_MAX_APPLICANTS = 2000;

export const EMPLOYEE_DIRECTORY_DEFAULT_PAGE_SIZE = 50;
export const EMPLOYEE_DIRECTORY_MAX_PAGE_SIZE = 100;
