import type { ReactNode } from "react";

import { adminCardCls } from "./admin-design-tokens";

type Props = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

/** Single rounded list card (Recruiting lead card style). */
export function AdminListCard({ children, className = "", hover = true }: Props) {
  return (
    <div
      className={`${adminCardCls} p-4 transition ${
        hover ? "hover:border-sky-200/80 hover:shadow-md hover:shadow-sky-100/50" : ""
      } ${className}`.trim()}
    >
      {children}
    </div>
  );
}
