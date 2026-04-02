"use client";

import { useState } from "react";

type Props = {
  address: string;
  className?: string;
};

export function CopyAddressButton({ address, className }: Props) {
  const [label, setLabel] = useState("Copy address");

  const onCopy = async () => {
    const t = address.trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      setLabel("Copied");
      window.setTimeout(() => setLabel("Copy address"), 2000);
    } catch {
      setLabel("Copy failed");
      window.setTimeout(() => setLabel("Copy address"), 2000);
    }
  };

  if (!address.trim()) return null;

  return (
    <button type="button" onClick={onCopy} className={className}>
      {label}
    </button>
  );
}
