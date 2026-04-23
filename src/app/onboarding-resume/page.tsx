import type { Metadata } from "next";

import OnboardingResumeForm from "./OnboardingResumeForm";

export const metadata: Metadata = {
  title: "Resume onboarding | Saintly Home Health",
  description: "Request a link to continue employee onboarding for Saintly Home Health.",
};

export default function OnboardingResumePage() {
  return (
    <main className="shh-page">
      <section className="shh-shell py-10">
        <OnboardingResumeForm />
      </section>
    </main>
  );
}
