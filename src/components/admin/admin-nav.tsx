"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarDays, Gamepad2, LayoutDashboard, Megaphone, ScrollText, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/games", label: "Games", icon: Gamepad2 },
  { href: "/admin/integrations", label: "Integrations", icon: CalendarDays },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/health", label: "Health", icon: Activity },
];

/**
 * The admin area's own menu, under the app's sidebar entry. A client component
 * only for the highlight: the admin layout is not re-rendered when you move
 * between its pages, so the active section has to come from the URL here.
 * One row that scrolls sideways on a phone rather than wrapping.
 */
export function AdminNav() {
  const pathname = usePathname();

  return <nav aria-label="Admin sections" className="mb-6">
    <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SECTIONS.map((section) => {
        const active = section.href === "/admin" ? pathname === "/admin" : pathname === section.href || pathname.startsWith(`${section.href}/`);
        const Icon = section.icon;
        return <li key={section.href} className="shrink-0">
          <Link
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "press flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]",
              active
                ? "border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "bg-[var(--card)]/60 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {section.label}
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
