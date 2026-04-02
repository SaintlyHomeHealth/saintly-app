"use client";

import { useState } from "react";

type Props = {
  link: string;
  className?: string;
};

export default function CopyOnboardingLinkButton({ link, className }: Props) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy onboarding link:", link);
        }
      }}
    >
      {done ? "Copied" : "Copy onboarding link"}
    </button>
  );
}
