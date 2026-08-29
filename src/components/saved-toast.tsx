"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast-provider";

/**
 * Fires a confirmation toast for a `?saved=1` redirect, then strips the flag
 * from the URL so a refresh or back-navigation does not replay it. Server
 * Actions that redirect away from the form they submitted use this instead of
 * holding state across the navigation.
 */
export function SavedToast({ message, clearParams = ["saved"] }: { message: string; clearParams?: string[] }) {
  const { toast } = useToast();
  const flags = clearParams.join(",");

  useEffect(() => {
    toast(message);
    const url = new URL(window.location.href);
    for (const flag of flags.split(",")) url.searchParams.delete(flag);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [flags, message, toast]);

  return null;
}
