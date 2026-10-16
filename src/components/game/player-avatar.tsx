import { textOn } from "@/components/calendar/item-style";
import { JOB_COLORS } from "@/components/jobs/job-colors";
import { cn } from "@/lib/utils";

/**
 * A player's colour, from their user id alone. Never from anything about the
 * round: a colour that followed the role, the seat or the turn would hint at
 * the one thing a hidden-role round keeps secret. The id is stable for the
 * whole game, so each person keeps their colour from the lobby to the reveal.
 */
export function playerColor(userId: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return JOB_COLORS[(hash >>> 0) % JOB_COLORS.length];
}

/** The player's initial on their colour, with an optional online dot. */
export function PlayerAvatar({ userId, name, present, size = "md", className }: { userId: string; name: string; present?: boolean; size?: "sm" | "md"; className?: string }) {
  const color = playerColor(userId);
  return <span aria-hidden="true" className={cn("relative grid shrink-0 place-items-center rounded-full font-display font-semibold", size === "sm" ? "size-7 text-xs" : "size-10 text-base", className)} style={{ backgroundColor: color, color: textOn(color) }}>
    {name.trim().charAt(0).toUpperCase() || "?"}
    {present !== undefined && <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-[var(--card)]", present ? "bg-[var(--success)]" : "bg-[var(--muted-foreground)]")} />}
  </span>;
}
