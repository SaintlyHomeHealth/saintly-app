"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type SessionRes = {
  applicantId: string | null;
  displayName: string | null;
  debug?: { onboarding_status: unknown; pipeline: unknown };
};

/**
 * When an admin uses “View as employee” (`?obPreview=1`), this seeds `localStorage.applicantId` from
 * a secure cookie via `/api/admin/employee-onboarding-preview/session` and shows a read-only preview banner.
 */
export default function OnboardingAdminPreviewClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionRes | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (searchParams.get("obPreview") !== "1") return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/employee-onboarding-preview/session", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as SessionRes;
      if (data.applicantId) {
        try {
          localStorage.setItem("applicantId", data.applicantId);
        } catch {
          /* ignore */
        }
        try {
          sessionStorage.setItem("onboarding_admin_preview", "1");
        } catch {
          /* ignore */
        }
        setSession(data);
      }
      const next = new URLSearchParams(searchParams.toString());
      next.delete("obPreview");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router, pathname]);

  useEffect(() => {
    if (searchParams.get("obPreview") === "1") return;
    try {
      if (sessionStorage.getItem("onboarding_admin_preview") === "1" && !session) {
        void fetch("/api/admin/employee-onboarding-preview/session", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d && typeof d === "object" && d !== null) setSession(d as SessionRes);
          });
      }
    } catch {
      /* ignore */
    }
  }, [searchParams, session]);

  if (!session?.applicantId) {
    if (searchParams.get("obPreview") === "1") {
      return (
        <div className="w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          Loading admin preview…
        </div>
      );
    }
    return null;
  }

  return (
    <div className="w-full border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm">
          <span className="font-bold">Admin preview mode</span>
          {session.displayName
            ? ` — viewing onboarding as ${session.displayName} (applicantId matches employee record). You are not logged in as this person; data loads through your admin session.`
            : " — your browser is using the same applicantId as the employee for this flow."}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={
              session.applicantId
                ? `/admin/employees/${encodeURIComponent(session.applicantId)}`
                : "/admin/employees"
            }
            className="inline-flex rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-950"
          >
            Back to admin record
          </a>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950"
          >
            {expanded ? "Hide" : "Show"} step debug
          </button>
        </div>
      </div>
      {expanded && session.debug ? (
        <pre className="mx-auto mt-2 max-h-48 max-w-5xl overflow-auto rounded-lg bg-slate-900 p-3 text-left text-xs text-amber-100">
          {JSON.stringify(session.debug, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
