"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  staffProfileId: string;
};

const ERROR_LABELS: Record<string, string> = {
  forbidden: "You do not have permission.",
  missing_staff_profile_id: "Invalid request.",
  missing_email: "This row needs a work email to find the auth user.",
  load_failed: "Could not load the staff record.",
  auth_not_found_for_email: "No Supabase Auth user exists for this row’s email.",
  auth_user_linked_elsewhere: "That auth account is already linked to another staff row.",
  auth_user_load_failed: "Could not load the auth user after lookup.",
  auth_user_missing_email: "Auth user has no email on file.",
  link_failed: "Database update failed while linking.",
};

const OUTCOME_SUCCESS: Record<string, string> = {
  login_linked_from_email: "Login linked: found auth user by email and synced user_id and email.",
  login_link_refreshed: "Link OK: row already matched — refreshed email from Auth.",
  login_reassigned_from_email: "Login repaired: relinked this row to the auth user for this email.",
};

export function RepairLoginLinkButton({ staffProfileId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function run() {
    if (
      !window.confirm(
        "Find the Supabase Auth user for this row’s work email and sync user_id + email on this staff row?"
      )
    ) {
      return;
    }
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff/repair-login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ staffProfileId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        outcome?: string;
      };

      if (!res.ok || !data.ok) {
        const code = typeof data.error === "string" ? data.error : "request_failed";
        const base = ERROR_LABELS[code] ?? "Repair failed.";
        const detail = typeof data.detail === "string" && data.detail ? ` (${data.detail})` : "";
        setMessage({ kind: "err", text: base + detail });
        return;
      }

      const outcome = typeof data.outcome === "string" ? data.outcome : "";
      const text =
        OUTCOME_SUCCESS[outcome] ?? "Repair complete — staff row synced with Auth.";
      setMessage({ kind: "ok", text });
      router.refresh();
    } catch {
      setMessage({ kind: "err", text: "Network error. Try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={run}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
      >
        {loading ? "Repairing…" : "Repair link"}
      </button>
      {message ? (
        <p
          className={`max-w-[14rem] text-[10px] leading-snug ${
            message.kind === "ok" ? "text-emerald-800" : "text-red-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
