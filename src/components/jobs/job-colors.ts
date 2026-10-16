/**
 * Job colours are not decoration: they key the stacked bars, the legend, the
 * dots beside every total, and the icon tint on each shift row. A free colour
 * well happily returns something that vanishes against the card in one theme or
 * the other, so the form offers a palette that stays legible in both and keeps
 * the native picker as the deliberate way out.
 *
 * A plain module so /jobs/new, a server component, can read it: a value
 * exported from a "use client" file reaches the server only as a reference.
 */
export const JOB_COLORS = ["#6d5ce7", "#0ea5e9", "#12b76a", "#f79009", "#f04438", "#ec4899", "#8b5cf6", "#14b8a6"];

/** The first palette colour no active job uses, so a new job is told apart on the charts without anyone choosing. */
export function nextJobColor(used: string[]) {
  const taken = new Set(used.map((color) => color.toLowerCase()));
  return JOB_COLORS.find((color) => !taken.has(color)) ?? JOB_COLORS[used.length % JOB_COLORS.length];
}
