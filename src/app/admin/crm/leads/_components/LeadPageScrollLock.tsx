"use client";

import { useEffect } from "react";

export function LeadPageScrollLock() {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const logWindowScroll = () => {
      console.log("WINDOW SCROLL", window.scrollY);
    };

    window.addEventListener("scroll", logWindowScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", logWindowScroll);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  return null;
}
