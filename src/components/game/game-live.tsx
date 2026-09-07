"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { pollGameRoom } from "@/app/actions/game";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Keeps a game screen current, and tells the room this player is still here.
 *
 * Two mechanisms, and the split is deliberate.
 *
 * Realtime carries a doorbell. `broadcast_game_change` sends the name of the
 * table that changed and nothing else, so when one arrives the response is to
 * re-run the server render -- the same RLS-scoped queries as a normal page load.
 * No game data travels over the socket, which is what keeps the secrecy rules in
 * one place instead of two. See 20260907150000_imposter_realtime_signals.sql.
 *
 * The timer stays, because presence has to be refreshed either way and because
 * the socket is the part most likely to fail: a strict CSP, a proxy that drops
 * websockets, a project with Realtime turned off. If the channel is up the timer
 * slows to a heartbeat; if it never connects the screen is exactly as live as it
 * was before Realtime existed. Nothing about the game depends on the socket
 * working -- it only makes it faster.
 *
 * The timer refreshes only when the room's fingerprint actually changes. It used
 * to call `router.refresh()` on every tick, which re-ran the whole server render
 * -- lobby query, scoreboard, category list -- every 2.5 seconds per player, in a
 * room where usually nothing had happened. Worse, Next.js serialises Server
 * Actions, so a tap on "End game" queued behind whatever the poll had in flight
 * and looked like it had done nothing for a second or two. Now an idle room
 * costs one cheap query and no render at all.
 */

/** Heartbeat only: Realtime is delivering the updates. Under PRESENCE_WINDOW_MS. */
const LIVE_INTERVAL_MS = 10_000;

/** Realtime is not connected, so this interval is what makes the screen move. */
const FALLBACK_INTERVAL_MS = 2_500;

export function GameLive({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  // Written from a timer callback rather than during render, and deliberately a
  // ref: the fingerprint drives whether to refresh, never what to draw, so
  // holding it in state would re-render the component for no reason.
  const lastVersion = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const supabase = createClient();

    void (async () => {
      try {
        // A private channel authorizes against the caller's JWT, which is what
        // the policy on realtime.messages reads. Without this the subscription
        // is rejected and we stay on the fallback interval.
        await supabase.realtime.setAuth();
        if (cancelled) return;

        channel = supabase
          .channel(`game:${roomId}`, { config: { private: true } })
          .on("broadcast", { event: "changed" }, () => {
            lastVersion.current = null;
            router.refresh();
          })
          .subscribe((status) => {
            if (!cancelled) setLive(status === "SUBSCRIBED");
          });
      } catch {
        // Realtime unavailable. The interval below is already covering us.
        if (!cancelled) setLive(false);
      }
    })();

    return () => {
      cancelled = true;
      setLive(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [roomId, router]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const interval = live ? LIVE_INTERVAL_MS : FALLBACK_INTERVAL_MS;

    async function tick() {
      // Nothing happens while the tab is hidden. A backgrounded lobby would
      // otherwise keep refreshing its presence stamp all night, so a player who
      // wandered off hours ago would still read as present to a waiting host.
      if (document.visibilityState === "visible") {
        try {
          const version = await pollGameRoom(roomId);

          // First answer establishes the baseline rather than forcing a refresh
          // the page has just done for itself.
          if (!cancelled && version !== null) {
            const changed = lastVersion.current !== null && version !== lastVersion.current;
            lastVersion.current = version;
            if (changed) router.refresh();
          }
        } catch {
          // One dropped tick costs one stale render. The next recovers.
        }
      }
      if (!cancelled) timer = setTimeout(tick, interval);
    }

    timer = setTimeout(tick, interval);

    // Coming back to the tab should feel immediate rather than waiting out an
    // interval scheduled before it was hidden.
    function onVisible() {
      // Coming back after the tab was hidden: the fingerprint is stale by
      // definition, so drop it and take one refresh unconditionally.
      if (document.visibilityState === "visible" && !cancelled) {
        lastVersion.current = null;
        router.refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId, live, router]);

  return null;
}
