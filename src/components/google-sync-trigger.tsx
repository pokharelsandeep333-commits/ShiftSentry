"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** POSTs one sync run. `force` asks for the 30-second budget of an explicit request. */
export async function runSync(force: boolean) {
  const response = await fetch(`/integrations/google/sync${force ? "?force=1" : ""}`, { method: "POST", cache: "no-store" });
  return (await response.json().catch(() => ({ status: "unavailable", changed: 0 }))) as { status: string; changed: number };
}

/**
 * Starts a Google shift sync once the page is on screen, so the page never
 * waits on Google; the server throttles it to once every few minutes. When the
 * sync changed any shifts, the page re-renders with them.
 */
export function GoogleSyncTrigger() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    runSync(false).then((result) => { if (!cancelled && result.changed > 0) router.refresh(); }).catch(() => {});
    return () => { cancelled = true; };
  }, [router]);
  return null;
}

export function SyncNowButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "recent" | "failed">("idle");
  async function sync() {
    setState("busy");
    try {
      const result = await runSync(true);
      setState(result.status === "ok" ? "done" : result.status === "skipped" ? "recent" : "failed");
      router.refresh();
    } catch {
      setState("failed");
    }
  }
  return <div className="flex items-center gap-2">
    <Button type="button" variant="outline" onClick={sync} disabled={state === "busy"}><RefreshCw className={state === "busy" ? "size-4 animate-spin" : "size-4"} />{state === "busy" ? "Syncing…" : "Sync now"}</Button>
    <span role="status" className="text-xs text-[var(--muted-foreground)]">{state === "done" ? "Up to date" : state === "recent" ? "Synced moments ago" : state === "failed" ? "Couldn't sync" : ""}</span>
  </div>;
}
