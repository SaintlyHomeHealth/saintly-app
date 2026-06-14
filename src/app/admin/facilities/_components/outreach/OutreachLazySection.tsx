"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type OutreachLazySectionProps = {
  children: ReactNode;
  /** px margin for intersection root */
  rootMargin?: string;
  skeleton?: ReactNode;
  minHeight?: string;
};

export function OutreachLazySection({
  children,
  rootMargin = "200px 0px",
  skeleton,
  minHeight = "8rem",
}: OutreachLazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : minHeight }}>
      {visible ? children : skeleton ?? <OutreachSectionSkeleton />}
    </div>
  );
}

export function OutreachSectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-slate-100/80" />
      ))}
    </div>
  );
}
