import { FacilityNotificationsProvider } from "@/app/admin/facilities/_components/FacilityNotificationsProvider";

export default function AdminFacilitiesLayout({ children }: { children: React.ReactNode }) {
  return <FacilityNotificationsProvider>{children}</FacilityNotificationsProvider>;
}
