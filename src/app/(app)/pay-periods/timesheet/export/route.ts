import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { lastDayOf } from "@/lib/pay-period";
import { createRateLimiter } from "@/lib/rate-limit";
import { readTimesheetParams, timesheetCsv } from "@/lib/timesheet";
import { getTimesheet } from "@/lib/timesheet-data";

export const dynamic = "force-dynamic";

const allowExport = createRateLimiter({ limit: 10, windowMs: 60_000 });
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * The timesheet on screen as CSV. A plain GET: it only reads, through the same
 * RLS-scoped loader as the page, and writes nothing, so a link is enough.
 * Rate limited per account because each download pages every shift in the
 * period's weeks. The file name carries dates only, never a job name.
 */
export async function GET(request: Request) {
  const profile = await requireUser();
  if (!allowExport(profile.id)) return new NextResponse("Too many downloads. Try again in a minute.", { status: 429, headers: { ...headers, "Retry-After": "60" } });

  const search = new URL(request.url).searchParams;
  const params = readTimesheetParams((name) => search.get(name));
  const generatedAt = new Date();
  let data;
  try {
    data = await getTimesheet(profile, params, generatedAt);
  } catch (error) {
    console.error("timesheet export failed", error instanceof Error ? error.message : "unknown error");
    return new NextResponse("The timesheet could not be prepared. Please try again.", { status: 503, headers });
  }
  if (!data.selected || !data.sheet) return new NextResponse("No job has a pay schedule yet.", { status: 404, headers });

  const { sheet, selected, scope } = data;
  const csv = timesheetCsv(sheet, {
    title: scope === "all" ? "All jobs" : selected.name,
    scopeLabel: scope === "all" ? `All active jobs (pay period from ${selected.name}'s schedule)` : `${selected.name} only`,
    timeZone: profile.time_zone,
    generatedAt,
  });
  return new NextResponse(csv, {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shiftsentry-timesheet-${sheet.period.start}-to-${lastDayOf(sheet.period)}.csv"`,
    },
  });
}
