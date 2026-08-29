import { WifiOff } from "lucide-react";
import { Brand } from "@/components/brand";

/**
 * Served by the service worker when a navigation fails. Deliberately static and
 * unauthenticated -- it is precached at install time, so it cannot call
 * `requireUser()` or read anything user-specific.
 */
export const metadata = { title: "Offline | ShiftSentry" };

export default function OfflinePage() {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
    <Brand />
    <span className="grid size-14 place-items-center rounded-2xl bg-[var(--surface-subtle)] text-[var(--muted-foreground)]"><WifiOff className="size-6" /></span>
    <div className="space-y-2">
      <h1 className="font-display text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">ShiftSentry needs a connection to load your shifts and earnings. This page will work again as soon as you reconnect.</p>
    </div>
  </main>;
}
