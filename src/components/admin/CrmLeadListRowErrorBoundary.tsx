"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  leadId: string;
  children: ReactNode;
};

type State = { hasError: boolean };

/**
 * Prevents one malformed lead row from crashing the entire CRM leads list.
 */
export class CrmLeadListRowErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[crm/leads] row render failed", {
      leadId: this.props.leadId,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="col-span-full border-b border-amber-100 bg-amber-50/40 px-4 py-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Unable to display this lead</p>
            <p className="mt-1 text-xs text-amber-900/90">
              Open the lead detail page or contact admin. Other leads in the list are still available.
            </p>
            <a
              href={`/admin/crm/leads/${encodeURIComponent(this.props.leadId)}`}
              className="mt-2 inline-block text-xs font-semibold text-sky-800 underline-offset-2 hover:underline"
            >
              Open lead details
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
