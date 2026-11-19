"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { CalendarClock, CalendarDays, Palette, ShieldCheck, type LucideIcon } from "lucide-react";
import type { SettingsSectionId } from "@/components/settings/sections";
import { cn } from "@/lib/utils";

const ICONS: Record<SettingsSectionId, LucideIcon> = {
  week: CalendarClock,
  "google-calendar": CalendarDays,
  appearance: Palette,
  account: ShieldCheck,
};

/** How far below the viewport's top a section counts as the one being read. */
const READING_LINE = 140;

/**
 * The scrollable row of tabs above the Settings cards. The links are plain
 * anchors, so they work before hydration and a section can be linked to from
 * another page. Once hydrated, a click scrolls smoothly and focuses the section.
 *
 * The highlight follows the scroll position rather than the last click, so it
 * stays right when someone scrolls by hand. It is measured on scroll instead of
 * with an IntersectionObserver because the last section is short: an observer
 * never sees it cross a reading line it cannot scroll up to.
 */
export function SettingsNav({ sections }: { sections: readonly { id: SettingsSectionId; label: string }[] }) {
  const [active, setActive] = useState<SettingsSectionId>(sections[0].id);
  const rowRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let frame = 0;
    function measure() {
      frame = 0;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const atBottom = maxScroll > 4 && window.scrollY >= maxScroll - 4;
      let current = sections[0].id;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= READING_LINE) current = section.id;
      }
      setActive(atBottom ? sections[sections.length - 1].id : current);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  // Keep the active tab visible in the scrollable row. Scroll the row directly:
  // scrollIntoView would also scroll the page to bring the row into view.
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    const left = tab.offsetLeft;
    if (left < row.scrollLeft || left + tab.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: left - 16, behavior: "smooth" });
  }, [active]);

  function jump(event: MouseEvent<HTMLAnchorElement>, id: SettingsSectionId) {
    const target = document.getElementById(id);
    if (!target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
    window.history.replaceState(window.history.state, "", `#${id}`);
    setActive(id);
  }

  return <nav aria-label="Settings sections" className="min-w-0">
    <ul ref={rowRef} className="relative flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {sections.map((section) => {
        const Icon = ICONS[section.id];
        const current = section.id === active;
        return <li key={section.id} data-section={section.id} className="shrink-0">
          <a
            href={`#${section.id}`}
            onClick={(event) => jump(event, section.id)}
            aria-current={current ? "location" : undefined}
            className={cn(
              "press flex min-h-[44px] items-center gap-2.5 whitespace-nowrap rounded-xl border px-3.5 text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--primary)]",
              current
                ? "border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "bg-[var(--card)]/60 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {section.label}
          </a>
        </li>;
      })}
    </ul>
  </nav>;
}
