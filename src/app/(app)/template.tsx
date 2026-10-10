import type { ReactNode } from "react";
import { ViewTransition } from "react";

/**
 * The page-change animation for every signed-in route.
 *
 * A template, unlike the layout above it, remounts whenever the route below it
 * changes, so on a navigation the old page's boundary exits while the new
 * one enters. React runs enter and exit only for a `<ViewTransition>` that sits
 * above every DOM node of the page, and this one does: it wraps the loading
 * boundary and the page together. The shell is in the layout, outside it, so
 * the sidebar, header and bottom bar hold still while the body moves.
 *
 * The nav links tag their navigation `nav-forward` / `nav-back` by menu order
 * (app-shell.tsx), which picks the slide direction; anything else fades
 * through (`page-in` / `page-out`). Changes inside one page (its search
 * params, a refresh after saving) are updates, which stay unanimated here.
 * The animations are in the app-motion block of globals.css.
 */
const enter = { "nav-forward": "nav-forward-in", "nav-back": "nav-back-in", default: "page-in" };
const exit = { "nav-forward": "nav-forward-out", "nav-back": "nav-back-out", default: "page-out" };

export default function AppTemplate({ children }: { children: ReactNode }) {
  return <ViewTransition enter={enter} exit={exit} default="none">{children}</ViewTransition>;
}
