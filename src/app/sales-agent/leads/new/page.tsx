import { Suspense } from "react";

import { SalesAgentNewLeadForm } from "./SalesAgentNewLeadForm";

export default function SalesAgentNewLeadPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading form…</p>}>
      <SalesAgentNewLeadForm />
    </Suspense>
  );
}
