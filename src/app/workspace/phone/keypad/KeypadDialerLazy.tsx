"use client";

import { SoftphoneDialer } from "@/components/softphone/SoftphoneDialer";
import type { SoftphoneDialerProps } from "@/components/softphone/SoftphoneDialer";

/** Direct client import so the dialer reads the same softphone context as `WorkspaceSoftphoneProvider` after capabilities load. */
export function KeypadDialerLazy(props: SoftphoneDialerProps) {
  return <SoftphoneDialer {...props} />;
}
