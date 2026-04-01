"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { PhoneCrmDrawer } from "./PhoneCrmDrawer";
import { DesktopPhoneRail, PhoneAppShell } from "./PhoneAppShell";
import { PhoneConversationList } from "./PhoneConversationList";
import { PhoneThreadView } from "./PhoneThreadView";
import type {
  ContactPipelineState,
  PhoneCallRow,
  PhoneCallTaskSnippet,
  PhoneNotificationRow,
} from "../recent-calls-live";

type PhoneWorkspaceWithSelectionProps = {
  defaultSelectedCallId: string | null;
  triageCalls: PhoneCallRow[];
  calls: PhoneCallRow[];
  notifByCallId: Record<string, PhoneNotificationRow[]>;
  contactPipelineByContactId: Record<string, ContactPipelineState>;
  taskCountByCallId: Record<string, number>;
  taskSnippetsByCallId: Record<string, PhoneCallTaskSnippet[]>;
  allowUnassign: boolean;
  callVisibility: "full" | "nurse";
  currentUserId: string;
  assignableStaff: { user_id: string; label: string }[];
  callCount: number;
  fullCallsHref: string;
  errorMessage: string | null;
  topBar: ReactNode;
  dialerPanel: ReactNode;
  mobileHeader: ReactNode;
  mobileInbox: ReactNode;
  mobileThread: ReactNode;
  mobileKeypad: ReactNode;
  mobileBottomNav: ReactNode;
  mobileCallAs: ReactNode;
  mobileCrmSummary: ReactNode;
  alertsFooter: ReactNode;
};

export function PhoneWorkspaceWithSelection(props: PhoneWorkspaceWithSelectionProps) {
  const {
    defaultSelectedCallId,
    triageCalls,
    calls,
    notifByCallId,
    contactPipelineByContactId,
    taskCountByCallId,
    taskSnippetsByCallId,
    allowUnassign,
    callVisibility,
    currentUserId,
    assignableStaff,
    callCount,
    fullCallsHref,
    errorMessage,
    topBar,
    dialerPanel,
    mobileHeader,
    mobileInbox,
    mobileThread,
    mobileKeypad,
    mobileBottomNav,
    mobileCallAs,
    mobileCrmSummary,
    alertsFooter,
  } = props;

  const [selectedCallId, setSelectedCallId] = useState<string | null>(defaultSelectedCallId);

  useEffect(() => {
    setSelectedCallId((prev) => {
      if (prev && calls.some((c) => c.id === prev)) return prev;
      return defaultSelectedCallId;
    });
  }, [defaultSelectedCallId, calls]);

  const selectedRow = useMemo(() => {
    if (!selectedCallId) return calls[0] ?? null;
    return calls.find((c) => c.id === selectedCallId) ?? calls[0] ?? null;
  }, [calls, selectedCallId]);

  return (
    <PhoneAppShell
      topBar={topBar}
      leftRail={<DesktopPhoneRail />}
      conversationsPane={
        <div className="space-y-3">
          <PhoneConversationList
            calls={triageCalls}
            title="Needs Attention"
            subtitle="Phone number/name, activity, time, and assignment"
            selectedCallId={selectedCallId}
            onSelectCall={setSelectedCallId}
          />
          {alertsFooter}
        </div>
      }
      threadPane={
        <PhoneThreadView
          calls={calls}
          selectedCallId={selectedCallId}
          notifByCallId={notifByCallId}
          contactPipelineByContactId={contactPipelineByContactId}
          taskCountByCallId={taskCountByCallId}
          taskSnippetsByCallId={taskSnippetsByCallId}
          allowUnassign={allowUnassign}
          callVisibility={callVisibility}
          currentUserId={currentUserId}
          assignableStaff={assignableStaff}
          maxVisible={callCount}
          fullCallsHref={fullCallsHref}
          errorMessage={errorMessage}
        />
      }
      crmDrawer={<PhoneCrmDrawer selectedRow={selectedRow} />}
      dialerPanel={dialerPanel}
      mobileHeader={mobileHeader}
      mobileInbox={mobileInbox}
      mobileThread={mobileThread}
      mobileKeypad={mobileKeypad}
      mobileBottomNav={mobileBottomNav}
      mobileCallAs={mobileCallAs}
      mobileCrmSummary={mobileCrmSummary}
    />
  );
}
