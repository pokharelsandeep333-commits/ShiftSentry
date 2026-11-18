import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, CircleCheck, Download, Gauge } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton, TimesheetPeriodPicker } from "@/components/pay-periods/timesheet-controls";
import { formatCents } from "@/lib/earnings";
import { addDays, formatPayDay, formatPayPeriod } from "@/lib/pay-period";
import { entryStatusLabel, timesheetHref, type Timesheet, type TimesheetAmount, type TimesheetScope, type TimesheetWeek } from "@/lib/timesheet";
import type { TimesheetData } from "@/lib/timesheet-data";
import { cn, formatMinutes } from "@/lib/utils";

const MONEY = "text-[color-mix(in_srgb,var(--success)_78%,var(--foreground))]";
const CELL = "px-3 py-2.5 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6 print:px-2 print:py-1 print:first:pl-0 print:last:pr-0";
const HEAD = cn(CELL, "text-left text-xs font-semibold text-[var(--muted-foreground)]");
const NUM = "whitespace-nowrap text-right tabular-nums";
const WIDE = "hidden sm:table-cell print:table-cell";

function hours(minutes: number) {
  return minutes === 0 ? "–" : formatMinutes(minutes);
}

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

function rateText(rates: number[]) {
  return rates.map((rate) => `${formatCents(rate)}/h`).join(" · ");
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return <section aria-label={title} className={cn("premium-card mt-5 overflow-hidden rounded-2xl border bg-[var(--card)] print:mt-6 print:rounded-none print:border-0", className)}>
    <h2 className="border-b px-5 py-3 font-display text-base font-semibold sm:px-6 print:border-b-2 print:px-0 print:py-1.5 print:text-sm">{title}</h2>
    {children}
  </section>;
}

function WeekRow({ week }: { week: TimesheetWeek }) {
  const fill = week.limitMinutes ? Math.min(100, (week.minutes / week.limitMinutes) * 100) : 0;
  const status = week.limitMinutes === null ? "No cap" : week.over ? "Over cap" : week.minutes === week.limitMinutes ? "At cap" : "Under cap";
  return <tr className="border-t first:border-t-0">
    <td className={CELL}>
      <span className="font-medium tabular-nums">{formatPayDay(week.start)} – {formatPayDay(addDays(week.end, -1))}</span>
      {(week.extendsOutsidePeriod || week.provisional) && <span className="block text-xs text-[var(--muted-foreground)]">
        {[week.extendsOutsidePeriod && `${formatMinutes(week.inPeriodMinutes)} in this period`, week.provisional && (week.started ? "in progress, includes planned" : "not started, planned only")].filter(Boolean).join(" · ")}
      </span>}
    </td>
    <td className={cn(CELL, NUM, "whitespace-nowrap font-semibold")}>{formatMinutes(week.minutes)}</td>
    <td className={cn(CELL, NUM, WIDE, "text-[var(--muted-foreground)]")}>{week.limitMinutes === null ? "–" : formatMinutes(week.limitMinutes)}</td>
    <td className={cn(CELL, "w-[38%]")}>
      <span className="flex items-center gap-3">
        {week.limitMinutes !== null && <span aria-hidden="true" className="relative hidden h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] sm:block print:hidden">
          <span className={cn("absolute inset-y-0 left-0 rounded-full", week.over ? "bg-[var(--danger)]" : "bg-[var(--success)]")} style={{ width: `${fill}%` }} />
        </span>}
        <span className={cn("shrink-0 text-xs font-semibold", week.over ? "text-[var(--danger)]" : week.limitMinutes === null ? "text-[var(--muted-foreground)]" : MONEY)}>{status}</span>
      </span>
    </td>
  </tr>;
}

function Verdict({ sheet, scope, jobName }: { sheet: Timesheet; scope: TimesheetScope; jobName: string }) {
  const { verdict } = sheet;
  const Icon = verdict.kind === "over" ? CircleAlert : verdict.kind === "no_cap" ? Gauge : CircleCheck;
  const tone = verdict.kind === "over" ? "text-[var(--danger)]" : verdict.kind === "no_cap" ? "text-[var(--muted-foreground)]" : MONEY;
  return <Section title="Weekly cap">
    <div className="flex items-start gap-3 px-5 py-4 sm:px-6 print:px-0 print:py-2">
      <Icon aria-hidden="true" className={cn("mt-0.5 size-6 shrink-0", tone)} />
      <div>
        <p className={cn("font-display text-xl font-semibold", verdict.kind === "over" && "text-[var(--danger)]")}>{verdict.headline}</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{verdict.detail}</p>
        {scope === "job" && verdict.kind === "no_cap" && <p className="mt-1 text-sm text-[var(--muted-foreground)] print:hidden">{jobName} has no weekly limit of its own. Your overall cap is checked on the All jobs timesheet.</p>}
      </div>
    </div>
    <table className="w-full border-t text-sm">
      <thead><tr className="bg-[var(--surface-subtle)] print:bg-transparent">
        <th scope="col" className={HEAD}>Week</th>
        <th scope="col" className={cn(HEAD, NUM)}>Total</th>
        <th scope="col" className={cn(HEAD, NUM, WIDE)}>Cap</th>
        <th scope="col" className={HEAD}><span className="sr-only">Status</span></th>
      </tr></thead>
      <tbody>{sheet.weeks.map((week) => <WeekRow key={week.start} week={week} />)}</tbody>
    </table>
    <p className="border-t px-5 py-3 text-xs leading-5 text-[var(--muted-foreground)] sm:px-6 print:px-0">
      {scope === "all"
        ? "Week totals count every shift in the whole week, including days outside this pay period and shifts on archived jobs, the same way the weekly limit is enforced when a shift is saved."
        : `Week totals count every ${jobName} shift in the whole week, including days outside this pay period.`}
    </p>
  </Section>;
}

function Stat({ label, value, sub, money = false }: { label: string; value: string; sub?: string; money?: boolean }) {
  return <div className="min-w-0 px-5 py-4 sm:px-6 print:px-0 print:py-1">
    <p className="text-xs font-medium text-[var(--muted-foreground)]">{label}</p>
    <p className={cn("mt-1 font-display text-2xl font-semibold tabular-nums print:text-lg", money && MONEY)}>{value}</p>
    {sub && <p className="mt-0.5 text-xs tabular-nums text-[var(--muted-foreground)]">{sub}</p>}
  </div>;
}

function moneyCells(amount: TimesheetAmount, className?: string) {
  return <>
    <td className={cn(CELL, NUM, WIDE, className)}>{amount.minutes ? formatCents(amount.earnings.grossCents) : "–"}</td>
    <td className={cn(CELL, NUM, className, amount.minutes > 0 && MONEY)}>{amount.minutes ? formatCents(amount.earnings.netCents) : "–"}</td>
  </>;
}

/**
 * One pay period as a timesheet: the weekly-cap answer first, then totals, the
 * per-job split, and every shift by day. Every figure comes from `Timesheet`,
 * which builds money through period-totals.ts; this file only formats it.
 * The print stylesheet (globals.css) removes the app shell and the controls.
 */
export function TimesheetView({ data, viewerName, timeZone }: { data: TimesheetData; viewerName: string; timeZone: string }) {
  const { jobs, selected, periods, sheet, scope, today } = data;
  if (!selected || !sheet) return <>
    <PageHeader title="Timesheet" />
    <div className="premium-card flex flex-col items-start gap-3 rounded-2xl border p-6">
      <p className="font-medium">Timesheets follow a job&apos;s pay periods, and no job has a pay schedule yet.</p>
      <Link href="/jobs" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--primary)] sm:min-h-8">Add one to a job<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
    </div>
  </>;

  const { period } = sheet;
  const isCurrent = today >= period.start && today < period.end;
  const params = { job: selected.id, start: period.start, scope };
  const periodOptions = periods.map((option) => ({ value: timesheetHref("/pay-periods/timesheet", { ...params, start: option.start }), label: `${formatPayPeriod(option)}${today >= option.start && today < option.end ? " (current)" : ""}` }));
  const scopeTitle = scope === "all" ? "All jobs" : selected.name;
  const showJobColumn = scope === "all";

  return <div className="timesheet">
    <div className="hidden print:mb-4 print:block">
      <p className="text-xs">ShiftSentry timesheet · {viewerName}</p>
    </div>
    <PageHeader
      title={`Timesheet: ${formatPayPeriod(period)}`}
      description={`${scopeTitle}. Pay period from ${selected.name}'s schedule (${selected.scheduleLabel}). Estimated pay from each shift's saved rate, tax and deductions.`}
      actions={<div className="flex gap-2 print:hidden">
        <a href={timesheetHref("/pay-periods/timesheet/export", params)} download className={buttonVariants({ variant: "outline" })}><Download aria-hidden="true" className="size-4" />CSV</a>
        <PrintButton />
      </div>}
    />

    <div className="mb-2 flex flex-col gap-4 print:hidden sm:flex-row sm:flex-wrap sm:items-end">
      {jobs.length > 1 && <div className="min-w-0">
        <p id="timesheet-job" className="mb-1.5 text-xs font-semibold text-[var(--muted-foreground)]">Pay schedule</p>
        <nav aria-labelledby="timesheet-job" className="flex flex-wrap gap-2">
          {jobs.map((job) => {
            const active = job.id === selected.id;
            return <Link key={job.id} href={timesheetHref("/pay-periods/timesheet", { job: job.id, start: today, scope })} aria-current={active ? "true" : undefined} scroll={false} className={cn(
              "press inline-flex min-h-11 max-w-full items-center gap-2 whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:min-h-9",
              active ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--card)]/60 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
            )}><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: job.color }} /><span className="truncate">{job.name}</span></Link>;
          })}
        </nav>
      </div>}
      <div>
        <p id="timesheet-period" className="mb-1.5 text-xs font-semibold text-[var(--muted-foreground)]">Pay period</p>
        <TimesheetPeriodPicker key={period.start} labelledBy="timesheet-period" current={timesheetHref("/pay-periods/timesheet", params)} options={periodOptions} />
      </div>
      <div>
        <p id="timesheet-scope" className="mb-1.5 text-xs font-semibold text-[var(--muted-foreground)]">Shifts</p>
        <nav aria-labelledby="timesheet-scope" className="inline-flex rounded-full border bg-[var(--card)]/60 p-0.5">
          {(["all", "job"] as const).map((option) => <Link key={option} href={timesheetHref("/pay-periods/timesheet", { ...params, scope: option })} aria-current={scope === option ? "true" : undefined} scroll={false} className={cn(
            "press inline-flex min-h-10 items-center rounded-full px-3.5 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:min-h-8",
            scope === option ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          )}>{option === "all" ? "All jobs" : `${selected.name} only`}</Link>)}
        </nav>
      </div>
    </div>

    <Verdict sheet={sheet} scope={scope} jobName={selected.name} />

    <Section title="Totals">
      <div className="grid grid-cols-2 divide-x sm:grid-cols-3 print:grid-cols-3 print:divide-x-0">
        <Stat label="Worked" value={formatMinutes(sheet.worked.minutes)} sub={plural(sheet.days.filter((day) => day.worked.minutes > 0).length, "day")} />
        <Stat label="Net pay" value={formatCents(sheet.worked.earnings.netCents)} sub={`${formatCents(sheet.worked.earnings.grossCents)} gross`} money />
        {(isCurrent || sheet.scheduled.minutes > 0) && <Stat label="Still planned" value={formatMinutes(sheet.scheduled.minutes)} sub={sheet.scheduled.minutes ? `${formatCents(sheet.scheduled.earnings.netCents)} net if worked` : "Nothing left this period"} />}
      </div>
    </Section>

    {sheet.jobs.length > 0 && <Section title="By job">
      <table className="w-full text-sm">
        <thead><tr className="bg-[var(--surface-subtle)] print:bg-transparent">
          <th scope="col" className={HEAD}>Job</th>
          <th scope="col" className={cn(HEAD, WIDE)}>Rate</th>
          <th scope="col" className={cn(HEAD, NUM)}>Hours</th>
          <th scope="col" className={cn(HEAD, NUM, WIDE)}>Gross</th>
          <th scope="col" className={cn(HEAD, NUM)}>Net</th>
        </tr></thead>
        <tbody>{sheet.jobs.map((job) => <tr key={job.id} className="border-t">
          <td className={CELL}><span className="flex min-w-0 items-center gap-2 font-medium"><span aria-hidden="true" className="timesheet-dot size-2 shrink-0 rounded-full" style={{ background: job.color }} /><span className="truncate">{job.name}</span></span>
            {job.scheduled.minutes > 0 && <span className="block text-xs text-[var(--muted-foreground)]">+{formatMinutes(job.scheduled.minutes)} planned</span>}</td>
          <td className={cn(CELL, WIDE, "text-[var(--muted-foreground)] tabular-nums")}>{rateText(job.hourlyRatesCents)}</td>
          <td className={cn(CELL, NUM)}>{hours(job.worked.minutes)}</td>
          {moneyCells(job.worked)}
        </tr>)}</tbody>
      </table>
    </Section>}

    <Section title="Shifts by day">
      {sheet.days.length === 0
        ? <p className="px-5 py-6 text-sm text-[var(--muted-foreground)] sm:px-6 print:px-0">No shifts in this pay period.</p>
        : <table className="w-full text-sm">
          <thead><tr className="bg-[var(--surface-subtle)] print:bg-transparent">
            <th scope="col" className={HEAD}>Time</th>
            {showJobColumn && <th scope="col" className={cn(HEAD, WIDE)}>Job</th>}
            <th scope="col" className={cn(HEAD, WIDE)}>Status</th>
            <th scope="col" className={cn(HEAD, NUM)}>Hours</th>
            <th scope="col" className={cn(HEAD, NUM, WIDE)}>Gross</th>
            <th scope="col" className={cn(HEAD, NUM)}>Net</th>
          </tr></thead>
          {sheet.days.map((day) => <tbody key={day.date} className="timesheet-day">
            <tr className="border-t bg-[color-mix(in_srgb,var(--muted)_45%,var(--card))] print:bg-transparent">
              <th scope="rowgroup" colSpan={showJobColumn ? 3 : 2} className={cn(CELL, "text-left font-semibold")}>
                {formatPayDay(day.date, true)}
                {day.scheduled.minutes > 0 && <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">+{formatMinutes(day.scheduled.minutes)} planned</span>}
              </th>
              <td className={cn(CELL, NUM, "font-semibold")}>{hours(day.worked.minutes)}</td>
              {moneyCells(day.worked, "font-semibold")}
            </tr>
            {day.entries.map((entry) => <tr key={`${entry.shiftId}-${entry.date}`} className="border-t border-dashed">
              <td className={cn(CELL, "tabular-nums")}>
                {entry.continuesFromPreviousDay ? "Midnight" : formatInTimeZone(entry.startsAt, timeZone, "h:mm a")} – {entry.continuesNextDay ? "midnight" : formatInTimeZone(entry.endsAt, timeZone, "h:mm a")}
                {showJobColumn && <span className="block text-xs text-[var(--muted-foreground)] sm:hidden print:hidden">{entry.jobName}</span>}
                {(entry.continuesFromPreviousDay || entry.continuesNextDay) && <span className="block text-xs text-[var(--muted-foreground)]">{entry.continuesNextDay ? "Continues the next day" : "Continued from the day before"}</span>}
              </td>
              {showJobColumn && <td className={cn(CELL, WIDE)}><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="timesheet-dot size-2 shrink-0 rounded-full" style={{ background: entry.jobColor }} /><span className="truncate">{entry.jobName}</span></span></td>}
              <td className={cn(CELL, WIDE, "text-[var(--muted-foreground)]")}>{entryStatusLabel(entry.status)}{entry.scheduled.minutes > 0 && entry.worked.minutes > 0 ? ` (${formatMinutes(entry.scheduled.minutes)} to go)` : ""}</td>
              <td className={cn(CELL, NUM)}>{entry.worked.minutes ? formatMinutes(entry.worked.minutes) : <span className="text-[var(--muted-foreground)]">{formatMinutes(entry.scheduled.minutes)} planned</span>}</td>
              {moneyCells(entry.worked)}
            </tr>)}
          </tbody>)}
          <tfoot><tr className="border-t-2">
            <th scope="row" colSpan={showJobColumn ? 3 : 2} className={cn(CELL, "text-left font-semibold")}>Period total</th>
            <td className={cn(CELL, NUM, "font-semibold")}>{formatMinutes(sheet.worked.minutes)}</td>
            {moneyCells(sheet.worked, "font-semibold")}
          </tr></tfoot>
        </table>}
    </Section>

    <p className="mt-5 text-xs leading-5 text-[var(--muted-foreground)]">
      Times are in {timeZone}. A shift crossing midnight is split between the two days. Pay is counted for worked time only and is an estimate, not a payslip. Generated {formatInTimeZone(new Date(), timeZone, "MMM d, yyyy h:mm a")}.
    </p>
  </div>;
}
