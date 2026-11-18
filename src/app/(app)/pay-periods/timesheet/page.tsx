import { TimesheetView } from "@/components/pay-periods/timesheet-view";
import { requireUser } from "@/lib/auth";
import { readTimesheetParams } from "@/lib/timesheet";
import { getTimesheet } from "@/lib/timesheet-data";

export const metadata = { title: "Timesheet | ShiftSentry" };
export const dynamic = "force-dynamic";

const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireUser();
  const params = await searchParams;
  const data = await getTimesheet(profile, readTimesheetParams((name) => single(params[name])));
  return <TimesheetView data={data} viewerName={profile.display_name || profile.email} timeZone={profile.time_zone} />;
}
