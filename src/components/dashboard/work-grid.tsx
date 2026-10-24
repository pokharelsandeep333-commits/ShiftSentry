"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import styles from "./dashboard.module.css";

const WIDE_GRID_QUERY = "(min-width: 80rem)";

function subscribeToGrid(listener: () => void) {
  const query = window.matchMedia(WIDE_GRID_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function readWideGrid() {
  return window.matchMedia(WIDE_GRID_QUERY).matches;
}

function serverGrid() {
  return false;
}

/** Keep keyboard and reading order aligned with the stacked mobile layout.
 * Keyed fragments retain each panel's state when the breakpoint changes;
 * desktop grid positions also hold the correct layout before hydration. */
export function WorkGrid({ work, upcoming }: { work: ReactNode; upcoming: ReactNode }) {
  const wide = useSyncExternalStore(subscribeToGrid, readWideGrid, serverGrid);
  const panels = [{ key: "work", content: work }, { key: "upcoming", content: upcoming }];
  if (!wide) panels.reverse();

  return <section className={styles.topGrid}>
    {panels.map((panel) => <Fragment key={panel.key}>{panel.content}</Fragment>)}
  </section>;
}
