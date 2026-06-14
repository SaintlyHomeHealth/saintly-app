"use client";

import { createContext, useContext, type ReactNode } from "react";

import {
  useFacilityNotificationsState,
  type FacilityNotificationsState,
} from "@/app/admin/facilities/_components/useFacilityNotificationsState";

const FacilityNotificationsContext = createContext<FacilityNotificationsState | null>(null);

type FacilityNotificationsProviderProps = {
  children: ReactNode;
};

/** Single shared fetch for facility alerts across hub pages (bell, outreach, follow-ups, etc.). */
export function FacilityNotificationsProvider({ children }: FacilityNotificationsProviderProps) {
  const value = useFacilityNotificationsState({ autoGenerate: true, pollMs: 120_000 });
  return (
    <FacilityNotificationsContext.Provider value={value}>{children}</FacilityNotificationsContext.Provider>
  );
}

export function useOptionalFacilityNotificationsContext(): FacilityNotificationsState | null {
  return useContext(FacilityNotificationsContext);
}
