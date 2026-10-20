import { ShiftLog } from "@/components/shifts/shift-log";
export const metadata = { title: "Shifts | ShiftSentry" };
export const dynamic = "force-dynamic";
export default async function ShiftsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <div className="shift-workspace"><ShiftLog searchParams={searchParams} /></div>;
}
