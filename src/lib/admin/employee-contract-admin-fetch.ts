import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  EMPLOYEE_CONTRACT_ADMIN_LIST_COLUMNS,
  type EmployeeContractRow,
} from "@/lib/employee-contracts";

const LOG_PREFIX = "[admin_employee_detail.employee_contracts]";

const EXTENDED_COLUMNS = EMPLOYEE_CONTRACT_ADMIN_LIST_COLUMNS;

const MINIMAL_COLUMNS =
  "id, applicant_id, role_key, role_label, employment_classification, employment_type, pay_type, pay_rate, mileage_type, mileage_rate, effective_date, contract_status, contract_text_snapshot, admin_prepared_by, admin_prepared_at, employee_signed_name, employee_signed_at, created_at, updated_at";

function logSupabaseError(scope: string, employeeId: string, error: { code?: string; message?: string; details?: string; hint?: string }) {
  console.error(`${LOG_PREFIX} ${scope}`, {
    employeeId,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

/**
 * Strip non-JSON-safe values before RSC passes contract props to client components.
 */
export function serializeEmployeeContractForClient(
  row: EmployeeContractRow | null
): EmployeeContractRow | null {
  if (!row) return null;
  try {
    return JSON.parse(JSON.stringify(row)) as EmployeeContractRow;
  } catch (e) {
    console.error(`${LOG_PREFIX} serializeEmployeeContractForClient failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Loads the current employee contract for admin detail (service role; resilient to
 * is_current / version_number issues). Never throws — callers keep rendering the page.
 */
export async function fetchEmployeeContractForAdminDetail(
  employeeId: string
): Promise<{ data: EmployeeContractRow | null; loadError: string | null }> {
  try {
    const primary = await supabaseAdmin
      .from("employee_contracts")
      .select(EXTENDED_COLUMNS)
      .eq("applicant_id", employeeId)
      .eq("is_current", true)
      .maybeSingle<EmployeeContractRow>();

    if (primary.error) {
      logSupabaseError("primary.is_current=true query failed", employeeId, primary.error);

      const columnMissing =
        typeof primary.error.message === "string" &&
        (primary.error.message.includes("version_number") ||
          primary.error.message.includes("is_current") ||
          primary.error.code === "42703");

      if (columnMissing) {
        const legacy = await supabaseAdmin
          .from("employee_contracts")
          .select(MINIMAL_COLUMNS)
          .eq("applicant_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<EmployeeContractRow>();

        if (legacy.error) {
          logSupabaseError("legacy fallback (minimal columns) failed", employeeId, legacy.error);
          return {
            data: null,
            loadError:
              legacy.error.message ||
              "Could not load employment contract (database schema may need migration).",
          };
        }

        return {
          data: legacy.data ?? null,
          loadError:
            primary.error.message ||
            "Contract columns version_number / is_current missing; showing latest row if any.",
        };
      }

      const fallback = await supabaseAdmin
        .from("employee_contracts")
        .select(EXTENDED_COLUMNS)
        .eq("applicant_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<EmployeeContractRow>();

      if (fallback.error) {
        logSupabaseError("fallback latest row after primary error failed", employeeId, fallback.error);
        return {
          data: null,
          loadError: fallback.error.message || primary.error.message || "Contract query failed.",
        };
      }

      return {
        data: fallback.data ?? null,
        loadError: primary.error.message || null,
      };
    }

    if (primary.data) {
      return { data: primary.data, loadError: null };
    }

    const fallback = await supabaseAdmin
      .from("employee_contracts")
      .select(EXTENDED_COLUMNS)
      .eq("applicant_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<EmployeeContractRow>();

    if (fallback.error) {
      logSupabaseError("fallback latest row (no is_current match) failed", employeeId, fallback.error);
      return { data: null, loadError: fallback.error.message || null };
    }

    return {
      data: fallback.data ?? null,
      loadError: fallback.data
        ? "No contract row is flagged is_current=true; showing latest contract."
        : null,
    };
  } catch (e) {
    console.error(`${LOG_PREFIX} unexpected exception`, {
      employeeId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      data: null,
      loadError: e instanceof Error ? e.message : String(e),
    };
  }
}
