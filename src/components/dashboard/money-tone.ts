/**
 * Green marks money earned or due. A $0.00 (a period with nothing worked
 * yet) is not good news, so it reads in the neutral muted tone instead; only
 * a positive amount gets the success colour.
 */
export function moneyText(cents: number) {
  return cents > 0 ? "text-[var(--success-ink)]" : "text-[var(--muted-foreground)]";
}
