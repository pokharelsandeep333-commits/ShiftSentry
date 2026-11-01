import { formatInTimeZone } from "date-fns-tz";
import { PayHistoryView } from "@/components/pay-periods/pay-history-view";
import { requireUser } from "@/lib/auth";
import { clampPeriodCount, getPayHistory } from "@/lib/pay-history";

export const metadata = { title: "Pay periods | ShiftSentry" };
export const dynamic = "force-dynamic";

const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function PayPeriodsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireUser();
  const params = await searchParams;
  const count = clampPeriodCount(single(params.periods));
  const history = await getPayHistory(profile, single(params.job), count);
  return <PayHistoryView history={history} count={count} today={formatInTimeZone(new Date(), profile.time_zone, "yyyy-MM-dd")} />;
}
