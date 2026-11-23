/**
 * The Settings window's size and placement, shared by the real window
 * (`settings-dialog.tsx`) and its loading skeleton (`/settings/loading.tsx`).
 * They drifted once and the window visibly jumped from the skeleton's size to
 * its own as it loaded. A plain module, so the server-rendered skeleton can
 * import it: a value exported from a "use client" file reaches the server only
 * as a reference.
 *
 * Centred on `sm` and up with a 40px margin, at most 66rem by 48rem (Sandeep
 * found 62x46 too small and 70x52 too big, 2026-11-23); full
 * screen on phones. Sized against `100%`, not `100vw`, which counts the
 * scrollbar and pushed the window off-centre.
 */
export const SETTINGS_WINDOW_CLASS = "settings-window relative flex h-full w-full flex-col overflow-hidden bg-[var(--card)] sm:h-[min(48rem,calc(100dvh-5rem))] sm:w-[min(66rem,calc(100%-5rem))] sm:rounded-[1.25rem] sm:border";

/** The pane content column inside the window. */
export const SETTINGS_PANE_CLASS = "mx-auto max-w-3xl";
