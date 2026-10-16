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
 * The section list beside Settings: a sticky column from `lg`, a row of chips
 * above the sections on smaller screens. The links are plain anchors, so they
 * work before hydration and a section can be linked to from another page; once
 * hydrated, a click scrolls smoothly and moves focus to the section, which is
 * where a keyboard user expects to land.
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
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
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

  // Keep the active chip visible in the phone row. Set scrollLeft directly:
  // scrollIntoView would also scroll the page to bring the row into view.
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: left - 16, behavior: "smooth" });
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

  return <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
    <ul ref={rowRef} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
      {sections.map((section) => {
        const Icon = ICONS[section.id];
        const current = section.id === active;
        return <li key={section.id} data-section={section.id} className="shrink-0">
          <a
            href={`#${section.id}`}
            onClick={(event) => jump(event, section.id)}
            aria-current={current ? "location" : undefined}
            className={cn(
              "press flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-xl border px-3.5 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] lg:min-h-10 lg:border-transparent lg:px-3",
              current
                ? "border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "bg-[var(--card)]/60 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] lg:bg-transparent",
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
