"use client";

import { useEffect } from "react";

export function LeadPageScrollLock() {
  useEffect(() => {
    console.log("CLIENT RENDER");

    const logWindowScroll = () => {
      console.log("WINDOW SCROLL", window.scrollY);
    };

    window.addEventListener("scroll", logWindowScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", logWindowScroll);
    };
  }, []);

  return null;
}
