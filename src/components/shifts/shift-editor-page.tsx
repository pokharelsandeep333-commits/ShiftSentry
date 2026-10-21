import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";

/**
 * Adding or editing a shift is an ordinary page: a way back to the log, the
 * page heading, and the form in one card. It used to be a drawer over the log;
 * a page scrolls like every other one, works the same on a phone, and the
 * browser's Back does what people expect.
 */
export function ShiftEditorPage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="shift-page">
    <Link href="/shifts" className="shift-page-back"><ArrowLeft aria-hidden="true" />Shifts</Link>
    <PageHeader title={title} description={description} />
    <div className="shift-log shift-page-card">{children}</div>
  </div>;
}
