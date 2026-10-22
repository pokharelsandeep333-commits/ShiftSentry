import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/earnings";
import type { DashboardData } from "@/lib/types";
import { formatMinutes } from "@/lib/utils";
import styles from "./dashboard.module.css";

export function WeeklyPayForecast({ earnedNetCents, forecast, rangeLabel }: { earnedNetCents: number; forecast: DashboardData["weekForecast"]; rangeLabel: string }) {
  return <Card role="region" aria-labelledby="weekly-pay-title" className={styles.forecast}>
    <div className={styles.forecastHeading}>
      <h2 id="weekly-pay-title" className="font-display text-base font-semibold">Weekly pay forecast</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{rangeLabel} · after tax and deductions</p>
    </div>
    <dl className={styles.forecastFigures}>
      <div>
        <dt>Earned so far</dt>
        <dd>{formatCents(earnedNetCents)}</dd>
      </div>
      <div>
        <dt>Remaining shifts <span className="font-normal">(est.)</span></dt>
        <dd>{formatCents(forecast.remainingNetCents)}</dd>
      </div>
      <div className={styles.forecastTotal}>
        <dt>Projected total</dt>
        <dd>{formatCents(earnedNetCents + forecast.remainingNetCents)}<span className="ml-1.5 font-sans text-xs font-normal text-[var(--muted-foreground)]">est.</span></dd>
      </div>
    </dl>
    <div className={styles.forecastFootnote}>
      <p>{forecast.remainingShiftCount > 0 ? `${forecast.remainingShiftCount} shift${forecast.remainingShiftCount === 1 ? "" : "s"} with ${formatMinutes(forecast.remainingMinutes)} remaining this week. Estimates use each shift’s saved pay settings.` : "No scheduled work remains this week. The forecast updates when you add a shift."}</p>
    </div>
  </Card>;
}
