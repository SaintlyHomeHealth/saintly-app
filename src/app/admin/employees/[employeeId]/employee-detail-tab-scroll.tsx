"use client";

import { useEffect } from "react";

import {
  EMPLOYEE_DETAIL_TAB_SCROLL_ID,
  type EmployeeDetailWorkAreaTab,
} from "@/lib/employee-requirements/employee-detail-work-areas";

const TAB_SET = new Set<string>(Object.keys(EMPLOYEE_DETAIL_TAB_SCROLL_ID));

/**
 * Reads `?tab=` from the URL and scrolls to the matching work area on the employee detail page.
 */
export default function EmployeeDetailTabScroll({ tab }: { tab: string | null | undefined }) {
  useEffect(() => {
    if (!tab || !TAB_SET.has(tab)) return;
    const id = EMPLOYEE_DETAIL_TAB_SCROLL_ID[tab as EmployeeDetailWorkAreaTab];
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [tab]);

  return null;
}
