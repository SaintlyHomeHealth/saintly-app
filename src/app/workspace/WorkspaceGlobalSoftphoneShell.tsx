"use client";

import { ActiveCallTranscriptSheet } from "@/components/softphone/ActiveCallTranscriptSheet";

import { ActiveCallBar } from "./phone/_components/ActiveCallBar";
import { CallWaitingBanner } from "./phone/_components/CallWaitingBanner";
import { IncomingCallBanner } from "./phone/_components/IncomingCallBanner";
import { WorkspacePhoneCallDock } from "./phone/_components/WorkspacePhoneCallDock";
import { WorkspaceSoftphoneProvider } from "@/components/softphone/WorkspaceSoftphoneProvider";

/**
 * Twilio Device, inbound polling, and in-call UI — mounted only from `workspace/phone/layout.tsx`
 * so `/workspace/pay` avoids phone timers and Supabase-adjacent polling. Direct navigation to Pay
 * while a browser call is active is not supported (bottom nav is hidden during calls).
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
