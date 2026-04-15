"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchSavedCallOutputs,
  type SavedCallOutputRow,
} from "@/lib/phone/call-outputs-client";

export type UseCallOutputsState = {
  outputs: SavedCallOutputRow[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Loads saved AI outputs for a `phone_calls.id`. Pass `null` / `undefined` to stay idle.
 */
export function useCallOutputs(phoneCallId: string | null | undefined): UseCallOutputsState {
  const [outputs, setOutputs] = useState<SavedCallOutputRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const requestSeq = useRef(0);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const id = typeof phoneCallId === "string" ? phoneCallId.trim() : "";
  const active = id.length > 0;

  useEffect(() => {
    if (!active) {
      requestSeq.current += 1;
      return;
    }

    const seq = ++requestSeq.current;
    void (async () => {
      setLoading(true);
      setError(null);
      const result = await fetchSavedCallOutputs(id);
      if (seq !== requestSeq.current) return;
      if (!result.ok) {
        setOutputs([]);
        setError(result.error);
        setLoading(false);
        return;
      }
      setOutputs(result.data.outputs);
      setLoading(false);
    })();
  }, [id, active, tick]);

  return {
    outputs: active ? outputs : [],
    loading: active && loading,
    error: active ? error : null,
    refetch,
  };
}
