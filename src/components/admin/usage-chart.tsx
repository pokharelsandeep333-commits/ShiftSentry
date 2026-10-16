import { shortUtcDate } from "@/lib/admin-usage";

type Bucket = { key: string; count: number };

/**
 * A single-series bar chart for the admin overview, drawn in HTML so it costs
 * no client JavaScript. One series, so no legend: the title names it. Thin
 * bars with 4px rounded tops on the baseline and a 2px gap, a recessive top
 * gridline with the maximum, axis labels at the ends and the middle only, and
 * a hover label per bar whose hit area is the full column, not the bar. The
 * same numbers are in a visually hidden table for screen readers.
 */
export function UsageChart({ title, caption, data, unit }: { title: string; caption: string; data: Bucket[]; unit: [string, string] }) {
  const max = Math.max(1, ...data.map((bucket) => bucket.count));
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);
  const ticks = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  const noun = (count: number) => (count === 1 ? unit[0] : unit[1]);

  return <figure className="grid gap-3">
    <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-[var(--muted-foreground)]"><span className="font-semibold text-[var(--foreground)]">{total}</span> {noun(total)} · {caption}</span>
    </figcaption>

    <div aria-hidden="true" className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-[var(--border)]" />
      <span className="pointer-events-none absolute -top-2 right-0 bg-[var(--card)] pl-1 text-[0.65rem] tabular-nums text-[var(--muted-foreground)]">{max}</span>
      <div className="flex h-36 items-end gap-[2px] border-b border-[var(--border)]">
        {data.map((bucket) => <div key={bucket.key} className="group relative flex h-full min-w-0 flex-1 items-end">
          <div
            className="w-full rounded-t-[4px] bg-[var(--primary)] transition-opacity group-hover:opacity-80"
            style={{ height: bucket.count ? `max(2px, ${(bucket.count / max) * 100}%)` : 0 }}
          />
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border bg-[var(--card)] px-2 py-1 text-xs shadow-lg group-hover:block">
            <span className="text-[var(--muted-foreground)]">{shortUtcDate(bucket.key)}</span> · <span className="font-semibold tabular-nums">{bucket.count}</span> {noun(bucket.count)}
          </span>
        </div>)}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[0.65rem] text-[var(--muted-foreground)]">
        {data.map((bucket, index) => <span key={bucket.key} className="relative min-w-0 flex-1">
          {ticks.has(index) && <span className={`absolute whitespace-nowrap ${index === 0 ? "left-0" : index === data.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>{shortUtcDate(bucket.key)}</span>}
        </span>)}
      </div>
    </div>
    <div className="h-3" aria-hidden="true" />

    <table className="sr-only">
      <caption>{title}, {caption}</caption>
      <thead><tr><th scope="col">Starting</th><th scope="col">{unit[1]}</th></tr></thead>
      <tbody>{data.map((bucket) => <tr key={bucket.key}><td>{shortUtcDate(bucket.key)}</td><td>{bucket.count}</td></tr>)}</tbody>
    </table>
  </figure>;
}

/** A headline number with its label and an optional line of context under it. */
export function StatTile({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="rounded-2xl border bg-[var(--card)]/60 p-4">
    <p className="text-xs font-semibold text-[var(--muted-foreground)]">{label}</p>
    <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
    {detail && <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{detail}</p>}
  </div>;
}
