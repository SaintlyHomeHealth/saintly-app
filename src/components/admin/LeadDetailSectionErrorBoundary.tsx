"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  section: string;
  children: ReactNode;
};

type State = { hasError: boolean };

/**
 * Keeps one lead detail subsection from crashing the entire `/admin/crm/leads/[leadId]` route.
 */
export class LeadDetailSectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[crm/lead detail] section render failed", {
      section: this.props.section,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Unable to load {this.props.section}</p>
          <p className="mt-1 text-xs text-amber-900/90">The rest of this lead is still available below.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
