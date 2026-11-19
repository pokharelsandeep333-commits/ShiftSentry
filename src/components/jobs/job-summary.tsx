import { textOn } from "@/components/calendar/item-style";
import { calculateEarnings } from "@/lib/earnings";
import { cn } from "@/lib/utils";

type PayFields = { hourly_rate_cents: number; tax_rate_basis_points: number; job_deductions: { name: string; rate_basis_points: number }[] };

/**
 * An hour's pay after tax and deductions, through the same `calculateEarnings`
 * a shift is priced with. Labelled "about" wherever it is shown: a real shift
 * rounds its own total, so it can differ from a multiple of this by a cent.
 */
export function takeHomePerHourCents(job: PayFields) {
  return calculateEarnings(60, {
    hourlyRateCents: job.hourly_rate_cents,
    taxRateBasisPoints: job.tax_rate_basis_points,
    deductions: job.job_deductions.map((deduction) => ({ name: deduction.name, rateBasisPoints: deduction.rate_basis_points })),
  }).netCents;
}

/** Tax plus every deduction, in basis points: what the database caps at 100%. */
export function withheldBasisPoints(job: PayFields) {
  return job.tax_rate_basis_points + job.job_deductions.reduce((total, deduction) => total + deduction.rate_basis_points, 0);
}

export function formatPercent(basisPoints: number) {
  return `${Number((basisPoints / 100).toFixed(2))}%`;
}

/**
 * Two letters for a job's avatar, so two jobs that start with the same letter
 * still look different: the first letters of the first two words ("Student
 * Support Technician" is "ST"), or the first two letters of a one-word name
 * ("Sodexo" is "SO"). Punctuation is skipped; an empty name is "?".
 */
export function jobInitials(name: string) {
  const words = name.trim().split(/\s+/).map((word) => Array.from(word.replace(/[^\p{L}\p{N}]/gu, ""))).filter((letters) => letters.length > 0);
  const letters = words.length >= 2 ? [words[0][0], words[1][0]] : (words[0] ?? []).slice(0, 2);
  return letters.join("").toLocaleUpperCase() || "?";
}

/** The job's initials on its colour: the colour is how the job is recognised on every chart. */
export function JobAvatar({ name, color, size = "md", muted = false }: { name: string; color: string; size?: "md" | "lg"; muted?: boolean }) {
  return <span
    aria-hidden="true"
    className={cn("grid shrink-0 place-items-center font-display font-semibold leading-none tracking-tight shadow-sm", size === "lg" ? "size-12 rounded-2xl text-base" : "size-10 rounded-xl text-sm", muted && "opacity-55 grayscale-[35%]")}
    style={{ backgroundColor: color, color: textOn(color) }}
  >
    {jobInitials(name)}
  </span>;
}
