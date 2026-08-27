"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast-provider";

/**
 * Fires a confirmation toast for a `?saved=1` redirect, then strips the flag
 * from the URL so a refresh or back-navigation does not replay it. Server
 * Actions that redirect away from the form they submitted use this instead of
 * holding state across the navigation.
 */
export function SavedToast({ message }: { message: string }) {
  const { toast } = useToast();

  useEffect(() => {
    toast(message);
    const url = new URL(window.location.href);
    url.searchParams.delete("saved");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [message, toast]);

  return null;
}
