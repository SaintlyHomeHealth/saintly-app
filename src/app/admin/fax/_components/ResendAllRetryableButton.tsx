"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { resendFaxAction } from "@/app/admin/fax/actions";
import { fx } from "@/app/admin/fax/_components/fax-tokens";
import { classifyFaxFailure, isFaxFailureRetryable } from "@/lib/fax/classify-fax-failure";

type RetryableFax = {
  id: string;
  toNumber: string | null;
  failureReason: string | null;
  providerErrorCode: string | null;
};

export function ResendAllRetryableButton({ faxes }: { faxes: RetryableFax[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const retryable = faxes.filter((f) =>
    isFaxFailureRetryable(classifyFaxFailure(f.failureReason, f.providerErrorCode))
  );

  if (retryable.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={fx.btnSecondary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          let ok = 0;
          let failed = 0;
          for (const fax of retryable) {
            if (!fax.toNumber) {
              failed += 1;
              continue;
            }
            const result = await resendFaxAction(fax.id, fax.toNumber);
            if (result.ok) ok += 1;
            else failed += 1;
          }
          setBusy(false);
          setMessage(`Resent ${ok}. ${failed} skipped.`);
          router.refresh();
        }}
      >
        {busy ? "Resending…" : `Resend all retryable (${retryable.length})`}
      </button>
      {message ? <span className={fx.muted}>{message}</span> : null}
    </div>
  );
}
