"use client";

import { useEffect } from "react";

export default function LeadPageError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("LEAD PAGE CRASH", error);
  }, [error]);

  return (
    <div className="p-6">
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        Something went wrong
      </div>
    </div>
  );
}
