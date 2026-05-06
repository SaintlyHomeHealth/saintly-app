"use client";

import type { ReactNode } from "react";

function GuardedServerActionForm(props: {
  id: string;
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  submitButtonName: string;
  children: ReactNode;
}) {
  const { id, action, className, submitButtonName, children } = props;

  return (
    <form
      id={id}
      action={action}
      className={className}
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        if (submitter instanceof HTMLButtonElement && submitter.name !== submitButtonName) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}

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
    <GuardedServerActionForm
      id="form-lead-intake"
      action={action}
      className="space-y-10"
      submitButtonName="save_lead_intake"
    >
      {children}
    </GuardedServerActionForm>
  );
}

/** Terminal leads: payer + Medicare only; `name="save_lead_insurance_intake"`. */
export function LeadInsuranceIntakeSaveForm(props: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
}) {
  const { action, children } = props;

  return (
    <GuardedServerActionForm
      id="form-lead-insurance-intake"
      action={action}
      className="space-y-0"
      submitButtonName="save_lead_insurance_intake"
    >
      {children}
    </GuardedServerActionForm>
  );
}
