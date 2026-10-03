import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Ban, Check, LockKeyhole } from "lucide-react";
import { formatCents } from "@/lib/earnings";
import { cn, formatMinutes } from "@/lib/utils";
import { EXAMPLE_DAY, EXAMPLE_OVERNIGHT, EXAMPLE_RECEIPT, EXAMPLE_WEEK, spansOverlap, type ExampleSpan } from "@/lib/welcome-week";

/**
 * The landing page's rules bento. Each card draws its example from the same
 * helpers the app uses (`spansOverlap` mirrors the overlap constraint, the
 * overnight split is `allocateShiftMinutes`, the receipt is
 * `calculateEarnings`), so a card cannot show an outcome the database would not
 * produce.
 *
 * The bento sits inside the section's frosted panel, so its cards are tiles
 * in three tones: white glass (`glass`, the panel's own inner tile), the
 * dashboard weekly-cap card's violet wash (`tint`), and the same wash in the
 * success green (`mint`, for money). Server components throughout; the only
 * motion is the CSS scroll reveal.
 */
const [desk, cafe] = EXAMPLE_WEEK.jobs;

type Tone = "glass" | "tint" | "mint";

export function RulesBento({ week }: { week: ReactNode }) {
  return <div className="grid gap-3 sm:gap-4 lg:grid-cols-12">
    <article id="week" className="welcome-tile rv rv-rise scroll-mt-24 rounded-[1.25rem] p-5 sm:p-7 lg:col-span-8">
      <h3 className="font-display text-xl font-semibold">Try it on an example week.</h3>
      <p className="mt-1.5 max-w-[52ch] text-[15px] leading-6 text-[var(--muted-foreground)]">Two jobs, a 20 hour limit, one open Saturday. You&apos;re warned at 80% and 90%, and a shift that would pass your limit is refused. The numbers are made up; the rule is the one the app enforces.</p>
      <div className="mt-7">{week}</div>
    </article>
    <BentoCard tone="tint" className="lg:col-span-4" title="No double-booking." body="Two shifts can't overlap, even at different jobs. Back-to-back is fine.">
      <OverlapPreview />
    </BentoCard>
    <BentoCard tone="tint" className="lg:col-span-4" title="Your schedule is yours." body={<>Other ShiftSentry users can&apos;t see your jobs or shifts. <Link href="/privacy" className="font-semibold text-[var(--primary)] underline decoration-[color-mix(in_srgb,var(--primary)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-[var(--primary)]">Read the privacy policy</Link>.</>}>
      <PrivacyPreview />
    </BentoCard>
    <BentoCard tone="glass" className="lg:col-span-5" title="Midnight splits the shift." body="An overnight shift counts toward both days it touches, in your own time zone. Shifts can run up to 24 hours, and your week can start on any day.">
      <OvernightPreview />
    </BentoCard>
    <BentoCard tone="mint" className="lg:col-span-3" title="Pay is locked when you work it." body="Each shift keeps its rate and tax. A raise next month doesn't rewrite last month.">
      <ReceiptPreview />
    </BentoCard>
  </div>;
}

function BentoCard({ tone, className, title, body, children }: { tone: Tone; className?: string; title: string; body: ReactNode; children: ReactNode }) {
  return <article className={cn("rv rv-rise flex flex-col rounded-[1.25rem] p-5 sm:p-7", tone === "glass" && "welcome-tile", tone !== "glass" && "welcome-tint", tone === "mint" && "welcome-tint--mint", className)}>
    <div className="flex flex-1 flex-col justify-center" aria-hidden="true">{children}</div>
    <h3 className="mt-7 font-display text-lg font-semibold">{title}</h3>
    <p className="mt-1.5 max-w-[46ch] text-[15px] leading-6 text-[var(--muted-foreground)]">{body}</p>
  </article>;
}

/* A noon to 8pm strip. Positions are fractions of that window. */
const DAY_START = 12 * 60;
const DAY_SPAN = 8 * 60;
const TICKS = ["12pm", "4pm", "8pm"];

function place(span: ExampleSpan): CSSProperties {
  return { left: `${((span.startMinute - DAY_START) / DAY_SPAN) * 100}%`, width: `${((span.endMinute - span.startMinute) / DAY_SPAN) * 100}%` };
}

function OverlapPreview() {
  const clashes = spansOverlap(EXAMPLE_DAY.clash, EXAMPLE_DAY.desk);
  const touches = !spansOverlap(EXAMPLE_DAY.desk, EXAMPLE_DAY.cafe);
  return <div className="pt-4">
    <div className="relative h-12">
      <span className="absolute inset-y-0 flex items-center rounded-l-full pl-4 text-sm font-semibold text-[#11121a]" style={{ ...place(EXAMPLE_DAY.desk), backgroundColor: desk.color }}>Desk</span>
      <span className="rv rv-slide absolute inset-y-0 flex items-center rounded-r-full pl-3 text-sm font-semibold text-[#11121a] shadow-[inset_2px_0_0_var(--card)]" style={{ ...place(EXAMPLE_DAY.cafe), backgroundColor: cafe.color }}>Café</span>
      {touches && <span className="rv rv-pop absolute -top-3 z-10 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-[var(--success)] text-white ring-4 ring-[var(--card)]" style={{ left: place(EXAMPLE_DAY.cafe).left }}><Check className="size-3.5" strokeWidth={3} /></span>}
    </div>
    <div className="relative mt-3 h-12">
      {clashes && <span className="rv rv-drop absolute inset-y-0 flex items-center gap-1.5 rounded-full border-2 border-dashed border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] px-3 text-sm font-semibold text-[color-mix(in_srgb,var(--danger)_75%,var(--foreground))]" style={place(EXAMPLE_DAY.clash)}><Ban className="size-4 shrink-0" /><span className="truncate">Clash</span></span>}
    </div>
    <div className="mt-4 flex justify-between text-xs tabular-nums text-[var(--muted-foreground)]">{TICKS.map((tick) => <span key={tick}>{tick}</span>)}</div>
  </div>;
}

/* 8pm Friday to 6am Saturday, with midnight at 40%. */
function OvernightPreview() {
  const total = EXAMPLE_OVERNIGHT.reduce((sum, part) => sum + part.minutes, 0);
  return <div className="pt-9">
    <div className="relative">
      <div className="flex h-12 overflow-hidden rounded-full" style={{ marginLeft: "20%", width: "60%" }}>
        {EXAMPLE_OVERNIGHT.map((part, index) => <span key={part.date} className={cn("rv rv-grow flex items-center justify-center text-sm font-semibold text-[#11121a]", index > 0 && "shadow-[inset_2px_0_0_var(--card)]")} style={{ width: `${(part.minutes / total) * 100}%`, backgroundColor: desk.color, opacity: index === 0 ? 0.72 : 1 }}>{formatMinutes(part.minutes)}</span>)}
      </div>
      <span className="absolute -bottom-2 -top-7 left-[40%] border-l-2 border-dashed border-[var(--foreground)]"><span className="absolute -top-0.5 left-1.5 text-xs font-medium">Midnight</span></span>
    </div>
    <div className="mt-4 grid grid-cols-[40%_1fr] text-xs text-[var(--muted-foreground)]">
      {EXAMPLE_OVERNIGHT.map((part) => <span key={part.date} className={part === EXAMPLE_OVERNIGHT[0] ? "pr-2 text-right" : "pl-2"}><span className="font-semibold text-[var(--foreground)]">{part.day}</span> {formatMinutes(part.minutes)}</span>)}
    </div>
  </div>;
}

/* The same week, as its owner and as any other signed-in user sees it: RLS
   returns the second one no rows at all. */
function PrivacyPreview() {
  const rows = EXAMPLE_WEEK.shifts.filter((shift) => !shift.planned);
  return <div className="grid grid-cols-2 gap-3 text-sm">
    <div className="rounded-xl border bg-[var(--card)] p-4">
      <p className="text-xs font-medium text-[var(--muted-foreground)]">You</p>
      <ul className="mt-3 space-y-2">{rows.map((shift) => {
        const job = EXAMPLE_WEEK.jobs.find((candidate) => candidate.id === shift.jobId);
        return <li key={`${shift.day}-${shift.jobId}`} className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: job?.color }} /><span className="truncate">{shift.day}</span></li>;
      })}</ul>
    </div>
    <div className="flex flex-col rounded-xl border border-dashed p-4">
      <p className="text-xs font-medium text-[var(--muted-foreground)]">Anyone else</p>
      <p className="grid flex-1 place-items-center py-3 text-center text-[var(--muted-foreground)]"><span><LockKeyhole className="mx-auto mb-2 size-5" />Nothing</span></p>
    </div>
  </div>;
}

function ReceiptPreview() {
  const rows = [
    { label: `${formatMinutes(EXAMPLE_RECEIPT.minutes)} × ${formatCents(EXAMPLE_RECEIPT.hourlyRateCents)}`, value: formatCents(EXAMPLE_RECEIPT.grossCents) },
    { label: `Tax ${EXAMPLE_RECEIPT.taxRateBasisPoints / 100}%`, value: `-${formatCents(EXAMPLE_RECEIPT.taxCents)}` },
  ];
  return <div className="rounded-xl border bg-[var(--card)] p-4 text-sm tabular-nums sm:p-5">
    <p className="flex justify-between text-[var(--muted-foreground)]"><span>{desk.name}</span><span>Mon</span></p>
    <div className="mt-4 space-y-2">{rows.map((row) => <p key={row.label} className="flex justify-between gap-3"><span>{row.label}</span><span>{row.value}</span></p>)}</div>
    <p className="mt-4 flex justify-between border-t border-dashed pt-4 font-display text-lg font-semibold"><span>Net</span><span>{formatCents(EXAMPLE_RECEIPT.netCents)}</span></p>
  </div>;
}
