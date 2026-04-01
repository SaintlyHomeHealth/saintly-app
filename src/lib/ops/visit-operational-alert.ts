import { supabaseAdmin } from "@/lib/admin";

import { sendOperationalAlertSms } from "./operational-alert-sms";

function contactLabel(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null): string {
  if (!row) return "Patient";
  const fn = (row.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return parts || "Patient";
}

/** Fire-and-forget SMS to operations number when a visit hits en_route or arrived. */
export function notifyOperationalVisitStatus(patientId: string, phase: "en_route" | "arrived"): void {
  const pid = patientId.trim();
  if (!pid) return;

  void (async () => {
    const { data: row, error } = await supabaseAdmin
      .from("patients")
      .select("id, contacts ( full_name, first_name, last_name )")
      .eq("id", pid)
      .maybeSingle();

    if (error) {
      console.warn("[visit-operational-alert] patient load:", error.message);
    }

    const raw = row?.contacts as
      | { full_name?: string | null; first_name?: string | null; last_name?: string | null }
      | { full_name?: string | null; first_name?: string | null; last_name?: string | null }[]
      | null
      | undefined;
    const c = Array.isArray(raw) ? raw[0] : raw ?? null;
    const name = contactLabel(c);
    const verb = phase === "en_route" ? "En route" : "Arrived";
    await sendOperationalAlertSms(
      `Saintly ops: Visit ${verb} — ${name}. Dispatch /admin/crm/dispatch · patient ${pid.slice(0, 8)}…`
    );
  })();
}
