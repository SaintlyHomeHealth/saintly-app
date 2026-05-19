"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";

import { isReactNativeWebViewShell } from "@/lib/softphone/native-speaker-bridge";

type Props = {
  show: boolean;
};

/** Mobile app only: prompt managers to enable push when no FCM device is registered. */
export function SalesAgentChatPushBanner({ show }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show || !isReactNativeWebViewShell()) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/workspace/mobile/push/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          hasRegisteredDevice?: boolean;
          pushNotificationsEnabled?: boolean;
        };
        if (cancelled) return;
        const needsBanner =
          json.pushNotificationsEnabled !== false && json.hasRegisteredDevice !== true;
        setVisible(needsBanner);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!visible) return null;

  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950">
      <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <p>
        Enable app notifications to receive Sales Agent chat alerts. Open your device Settings →
        Notifications for Saintly Phone if alerts are off.
      </p>
    </div>
  );
}
