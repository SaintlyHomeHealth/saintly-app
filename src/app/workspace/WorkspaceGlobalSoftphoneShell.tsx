"use client";

import { ActiveCallTranscriptSheet } from "@/components/softphone/ActiveCallTranscriptSheet";

import { ActiveCallBar } from "./phone/_components/ActiveCallBar";
import { CallWaitingBanner } from "./phone/_components/CallWaitingBanner";
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
      <CallWaitingBanner />
      <WorkspacePhoneCallDock />
      {children}
      <ActiveCallTranscriptSheet />
      <ActiveCallBar />
    </WorkspaceSoftphoneProvider>
  );
}
