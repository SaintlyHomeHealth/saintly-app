"use client";

import { ActiveCallBar } from "./phone/_components/ActiveCallBar";
import { IncomingCallBanner } from "./phone/_components/IncomingCallBanner";
import { WorkspacePhoneCallDock } from "./phone/_components/WorkspacePhoneCallDock";
import { WorkspaceSoftphoneProvider } from "@/components/softphone/WorkspaceSoftphoneProvider";

/**
 * Single Twilio Device + global incoming UI for all `/workspace/*` routes.
 */
export function WorkspaceGlobalSoftphoneShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceSoftphoneProvider>
      <IncomingCallBanner />
      <WorkspacePhoneCallDock />
      {children}
      <ActiveCallBar />
    </WorkspaceSoftphoneProvider>
  );
}
