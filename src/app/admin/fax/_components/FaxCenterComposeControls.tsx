"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getFaxClonePrefill } from "@/app/admin/fax/actions";
import type { FaxClonePrefill } from "@/lib/fax/fax-clone-prefill-types";

import { NewFaxPacketButton } from "./NewFaxPacketButton";
import { SendFaxButton } from "./SendFaxButton";

export function FaxCenterComposeControls() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneFromFaxId = searchParams.get("cloneFromFaxId")?.trim() ?? "";
  const [clonePrefill, setClonePrefill] = useState<FaxClonePrefill | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const handledCloneIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cloneFromFaxId || handledCloneIdRef.current === cloneFromFaxId) return;

    let cancelled = false;
    handledCloneIdRef.current = cloneFromFaxId;

    void (async () => {
      const result = await getFaxClonePrefill(cloneFromFaxId);
      if (cancelled) return;

      if (result.ok) {
        setClonePrefill(result.prefill);
        setAutoOpen(true);
        setCloneError(null);
      } else {
        setCloneError(result.error);
        handledCloneIdRef.current = null;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.delete("cloneFromFaxId");
      const qs = params.toString();
      router.replace(qs ? `/admin/fax?${qs}` : "/admin/fax", { scroll: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [cloneFromFaxId, router, searchParams]);

  return (
    <>
      {cloneError ? (
        <div
          role="alert"
          className="fixed bottom-4 left-4 z-[100] max-w-sm rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-950 shadow-lg"
        >
          {cloneError}
        </div>
      ) : null}
      <NewFaxPacketButton
        clonePrefill={clonePrefill}
        autoOpen={autoOpen}
        onCloneConsumed={() => {
          setAutoOpen(false);
          setClonePrefill(null);
          handledCloneIdRef.current = null;
        }}
      />
      <SendFaxButton />
    </>
  );
}
