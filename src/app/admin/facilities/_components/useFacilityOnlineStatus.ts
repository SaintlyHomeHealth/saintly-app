"use client";

import { useCallback, useEffect, useState } from "react";

export type OnlineStatus = "online" | "offline" | "checking";

async function pingOnline(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const res = await fetch("/api/facilities/field/ping", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export function useFacilityOnlineStatus() {
  const [status, setStatus] = useState<OnlineStatus>(() =>
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  );
  const [wasOffline, setWasOffline] = useState(false);

  const recheck = useCallback(async () => {
    setStatus("checking");
    const ok = await pingOnline();
    setStatus(ok ? "online" : "offline");
    return ok;
  }, []);

  useEffect(() => {
    void recheck();

    const onOnline = () => {
      setWasOffline(true);
      void recheck();
    };
    const onOffline = () => setStatus("offline");

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [recheck]);

  return {
    isOnline: status === "online",
    isOffline: status === "offline",
    isChecking: status === "checking",
    status,
    wasOffline,
    clearWasOffline: () => setWasOffline(false),
    recheck,
  };
}
