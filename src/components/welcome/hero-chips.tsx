import { Ban } from "lucide-react";
import { formatCents } from "@/lib/earnings";
import { formatMinutes } from "@/lib/utils";
import { EXAMPLE_WEEK, earnedSoFar, tryShift, weekTotals } from "@/lib/welcome-week";

/**
 * The frosted chips floating over the hero render. They are the example week
 * the render depicts, read off the same helpers as the interactive card lower
 * down, so the three always agree: 16 of 20 hours at the 80% line, a 5h
 * Saturday refused, and pay earned so far. Decorative duplicates of that card,
 * so hidden from assistive tech; the card itself is the accessible version.
 *
 * Phones have room for two. They keep the "Example week" chip, because it is
 * the one that says the numbers are illustrative, and the refusal.
 */
const totals = weekTotals(EXAMPLE_WEEK);
const refused = tryShift(EXAMPLE_WEEK, { jobId: "cafe", minutes: 300 });
const earned = earnedSoFar(EXAMPLE_WEEK);

export function HeroChips() {
  return <div aria-hidden="true">
    <div className="hero-chip glass-chip bottom-[6%] left-0 w-40 sm:bottom-auto sm:top-[18%] sm:w-48 [--chip-delay:500ms] [--chip-drift:7s]">
      <p className="text-xs font-medium text-[var(--muted-foreground)]">Example week</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{formatMinutes(totals.totalMinutes)}<span className="ml-1 font-sans text-[13px] font-normal text-[var(--muted-foreground)]">of {formatMinutes(EXAMPLE_WEEK.limitMinutes)}</span></p>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]"><span className="block h-full rounded-full bg-[var(--warning)]" style={{ width: `${totals.percent}%` }} /></span>
    </div>
    {refused.status === "refused" && <div className="hero-chip glass-chip right-0 top-[4%] flex items-center gap-2.5 [--chip-delay:700ms] [--chip-drift:8s] sm:right-[2%]">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--danger)] text-white"><Ban className="size-3.5" /></span>
      <span>
        <span className="block text-[13px] font-semibold">Saturday, {formatMinutes(300)}</span>
        <span className="block text-xs text-[var(--muted-foreground)]">Refused, {formatMinutes(refused.overByMinutes)} over the limit</span>
      </span>
    </div>}
    <div className="hero-chip glass-chip bottom-[16%] right-[4%] hidden [--chip-delay:900ms] [--chip-drift:6.5s] sm:block">
      <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)]"><span className="size-2 rounded-full bg-[var(--success)]" />Earned after tax</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{formatCents(earned.netCents)}</p>
    </div>
  </div>;
}
