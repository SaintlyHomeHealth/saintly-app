import { redirect } from "next/navigation";

/** @deprecated Use `/workspace/phone/visits`. */
export default function WorkspaceTodayRedirectPage() {
  redirect("/workspace/phone/visits");
}
