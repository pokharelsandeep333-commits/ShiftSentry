/**
 * The `sizes` of the landing's desktop dashboard capture. Shared by the
 * screenshot itself (`welcome-landing.tsx`) and the copy that slides in during
 * a theme swipe (`theme-swipe.tsx`): with the same `sizes` the browser picks
 * the same file for both, so the swipe reuses what is already downloaded.
 * Follows the `.welcome-container` widths in globals.css. A plain module, so
 * the server-rendered landing can import it too.
 */
export const DESKTOP_SHOT_SIZES = "(min-width: 1760px) 86rem, (min-width: 1440px) 78rem, (min-width: 1152px) 72rem, calc(100vw - 2rem)";
