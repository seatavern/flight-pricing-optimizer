"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "FLIGHT SIMULATOR", enabled: true },
  { href: "/decision-explorer", label: "DECISION EXPLORER", enabled: true },
  { href: "/policy-map", label: "POLICY MAP", enabled: true },
  { href: "/model-lab", label: "MODEL LAB", enabled: true },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-line bg-page px-6 py-2 lg:px-10">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {LINKS.map((item) => {
          const active = item.enabled && pathname === item.href;
          if (!item.enabled) {
            return (
              <li key={item.label}>
                <span
                  aria-disabled="true"
                  className="text-[11px] font-semibold tracking-[0.16em] text-muted-2"
                >
                  {item.label}
                </span>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={
                  active
                    ? "border-b border-navy pb-0.5 text-[11px] font-semibold tracking-[0.16em] text-navy"
                    : "text-[11px] font-semibold tracking-[0.16em] text-muted transition-colors hover:text-navy"
                }
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
