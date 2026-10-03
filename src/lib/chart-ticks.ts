/**
 * Y-axis ticks that land on round values. Recharts' own ticks split the domain
 * evenly, which for minutes shown as hours gave 6.7h, 13.3h and 26.7h: numbers
 * nobody reads a chart in. These step by 1, 2 or 5 times a power of ten in the
 * display unit (whole hours, whole dollars), never less than one unit, and run
 * from zero to the first step at or above the largest value.
 *
 * `max` and the ticks are in the chart's base unit (minutes, cents); `unit` is
 * how many base units make one display unit (60, 100). `target` is roughly how
 * many intervals the axis should have.
 */
export function niceAxisTicks(max: number, unit: number, target = 4): number[] {
  const top = Math.max(0, max) / unit;
  if (top === 0) return [0, unit];

  const rough = top / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude);
  const end = Math.ceil(top / step) * step;

  const ticks: number[] = [];
  for (let value = 0; value <= end; value += step) ticks.push(Math.round(value * unit));
  return ticks;
}
