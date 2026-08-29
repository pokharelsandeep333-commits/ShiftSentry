"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker. Production only: in development
 * Turbopack serves modules that change on every edit, and a worker sitting in
 * front of them turns HMR into a cache-invalidation puzzle.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => { void navigator.serviceWorker.register("/sw.js"); };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
