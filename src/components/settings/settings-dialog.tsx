"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays, CalendarRange, Palette, ShieldCheck, X, type LucideIcon } from "lucide-react";
import type { SettingsSectionId } from "@/components/settings/sections";
import { cn } from "@/lib/utils";
import { SETTINGS_PANE_CLASS, SETTINGS_WINDOW_CLASS } from "@/components/settings/window-frame";

const ICONS: Record<SettingsSectionId, LucideIcon> = {
  week: CalendarClock,
  "break-periods": CalendarRange,
  "google-calendar": CalendarDays,
  appearance: Palette,
  account: ShieldCheck,
};

/** Where the app shell records the last page that was not Settings, for Close. */
export const LAST_PAGE_KEY = "shiftsentry:last-page";

function subscribeToHash(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

export type SettingsPane = { id: SettingsSectionId; label: string; group: number; content: ReactNode };

/**
 * /settings as a window over the app: a sidebar of panes on the left (a row of
 * tabs on phones), one pane at a time on the right, a title bar with Close.
 * Sandeep asked for it after the long single page felt cluttered.
 *
 * It is a `<dialog>` rendered `open`, so the server HTML already shows it;
 * once hydrated it is reopened with `showModal()`, which puts it in the top
 * layer, makes the app behind it inert and traps focus. Escape (the dialog's
 * `cancel`), the Close button and a click on the dimmed backdrop all leave
 * without leaving a Settings entry in history: a step back when the page
 * behind is the app's, otherwise a replace with the last page that was not
 * Settings (`LAST_PAGE_KEY`, written by the app shell), or the dashboard.
 *
 * Panes are rendered on the server and only hidden here, so a half-filled form
 * keeps its values when you switch away and back. The active pane follows the
 * hash, so `/settings#google-calendar` still opens that pane; switching
 * rewrites the hash with `replaceState`. `initial` is the server's pick when
 * the hash says nothing (back from Google, for instance).
 */
export function SettingsDialog({ panes, initial }: { panes: SettingsPane[]; initial: SettingsSectionId }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash.slice(1), () => "");
  const [picked, setPicked] = useState<SettingsSectionId | null>(null);
  const active = picked ?? panes.find((pane) => pane.id === hash)?.id ?? initial;

  const close = useCallback(() => {
    // Came here from a page of the app: step back, so Back afterwards does not
    // reopen Settings. Otherwise (a fresh load, a link from outside, back from
    // Google) replace this entry with the last app page, again leaving no
    // Settings entry behind. The Navigation API tells us what is behind us;
    // without it, replace.
    const navigation = (window as Window & { navigation?: { currentEntry?: { index: number }; entries?: () => { url: string | null }[] } }).navigation;
    const index = navigation?.currentEntry?.index ?? -1;
    const previous = index > 0 ? navigation?.entries?.()[index - 1]?.url : null;
    if (previous) {
      const url = new URL(previous);
      if (url.origin === window.location.origin && !url.pathname.startsWith("/settings")) { router.back(); return; }
    }
    let target = "/";
    try { target = window.sessionStorage.getItem(LAST_PAGE_KEY) ?? "/"; } catch { /* storage blocked: the dashboard */ }
    router.replace(target.startsWith("/") && !target.startsWith("//") ? target : "/");
  }, [router]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.matches(":modal")) {
      dialog.close();
      dialog.showModal();
    }
  }, []);

  function choose(event: MouseEvent<HTMLAnchorElement>, id: SettingsSectionId) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setPicked(id);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${id}`);
    contentRef.current?.scrollTo({ top: 0 });
  }

  return <dialog
    ref={dialogRef}
    open
    aria-labelledby="settings-title"
    onCancel={(event) => { event.preventDefault(); close(); }}
    className="settings-dialog fixed inset-0 z-[60] m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-[var(--foreground)] sm:open:flex sm:open:items-center sm:open:justify-center"
  >
    <div className="settings-backdrop absolute inset-0" onClick={close} aria-hidden="true" />
    <div className={SETTINGS_WINDOW_CLASS}>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b px-5 sm:px-6">
        <h1 id="settings-title" className="font-display text-lg font-semibold">Settings</h1>
        <button type="button" onClick={close} aria-label="Close settings" className="press grid size-10 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav aria-label="Settings sections" className="shrink-0 border-b sm:w-60 sm:border-b-0 sm:border-r sm:bg-[var(--surface-subtle)]">
          <ul className="flex gap-1 overflow-x-auto px-3 py-2.5 [scrollbar-width:none] sm:flex-col sm:gap-0.5 sm:overflow-visible sm:p-3 [&::-webkit-scrollbar]:hidden">
            {panes.map((pane, index) => {
              const Icon = ICONS[pane.id];
              const current = pane.id === active;
              return <Fragment key={pane.id}>
                {index > 0 && panes[index - 1].group !== pane.group && <li aria-hidden="true" className="mx-3 my-2 hidden h-px bg-[var(--border)] sm:block" />}
                <li className="shrink-0">
                  <a
                    href={`#${pane.id}`}
                    onClick={(event) => choose(event, pane.id)}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "press flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)] sm:min-h-10",
                      current ? "bg-[var(--card)] text-[var(--foreground)] shadow-[0_0_0_1px_var(--border)] sm:font-semibold" : "text-[var(--muted-foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] hover:text-[var(--foreground)]",
                    )}
                  >
                    <Icon className={cn("size-[1.05rem] shrink-0", current && "text-[var(--primary)]")} aria-hidden="true" />
                    {pane.label}
                  </a>
                </li>
              </Fragment>;
            })}
          </ul>
        </nav>
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7">
          {panes.map((pane) => <div key={pane.id} hidden={pane.id !== active} className={SETTINGS_PANE_CLASS}>{pane.content}</div>)}
        </div>
      </div>
    </div>
  </dialog>;
}
