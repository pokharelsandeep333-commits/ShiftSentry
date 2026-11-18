"use client";

import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PremiumSelect, type SelectOption } from "@/components/ui/premium-select";

/**
 * The period picker: choosing a period opens its timesheet. The options carry
 * the full address, so this component knows nothing about the parameters.
 */
export function TimesheetPeriodPicker({ options, current, labelledBy }: { options: SelectOption[]; current: string; labelledBy: string }) {
  const router = useRouter();
  return <PremiumSelect name="period" labelledBy={labelledBy} defaultValue={current} options={options} onValueChange={(href) => router.push(href, { scroll: false })} className="w-full sm:w-64" />;
}

/** Opens the browser's print dialog; the print stylesheet in globals.css strips the app shell. */
export function PrintButton() {
  return <Button type="button" variant="outline" onClick={() => window.print()}><Printer aria-hidden="true" className="size-4" />Print</Button>;
}
