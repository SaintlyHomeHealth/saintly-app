"use client";

import type { ReactNode } from "react";

/**
 * Intake sections nest payer comboboxes and many controls inside one `<form>`.
 * Only the explicit “Save intake” buttons (`name="save_lead_intake"`) may submit this form.
 */
export function LeadIntakeSaveForm(props: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
}) {
  const { action, children } = props;

  return (
    <form
      id="form-lead-intake"
      action={action}
      className="space-y-10"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        if (submitter instanceof HTMLButtonElement && submitter.name !== "save_lead_intake") {
          e.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}
