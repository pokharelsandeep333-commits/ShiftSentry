import Link from "next/link";
import { CalendarClock, Clock3 } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteShift } from "@/app/actions/work";
import { formatMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The same wall-clock time one week later in the viewer's zone. Bumping the
 * local calendar date rather than adding 168 hours keeps a duplicate landing at
 * the same hour even when DST changes inside that week.
 */
function nextWeekLocal(value: string, timeZone: string) {
  const [date, time] = formatInTimeZone(value, timeZone, "yyyy-MM-dd'T'HH:mm").split("T");
  const bumped = new Date(`${date}T00:00:00Z`);
  bumped.setUTCDate(bumped.getUTCDate() + 7);
  return `${bumped.toISOString().slice(0, 10)}T${time}`;
}

function duplicateHref(shift: { job_id: string; starts_at: string; ends_at: string; notes: string | null }, timeZone: string) {
  const params = new URLSearchParams({ jobId: shift.job_id, startsAt: nextWeekLocal(shift.starts_at, timeZone), endsAt: nextWeekLocal(shift.ends_at, timeZone) });
  if (shift.notes) params.set("notes", shift.notes);
  return `/shifts/new?${params.toString()}`;
}

export default async function ShiftsPage() {
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data: shifts } = await supabase.from("shifts").select("id,job_id,starts_at,ends_at,notes,jobs(name,color,archived_at)").eq("user_id", profile.id).order("starts_at", { ascending: false }).limit(100);

  return <AppShell isAdmin={profile.role === "ADMIN"} userEmail={profile.email}>
    <PageHeader eyebrow="Shift log" title="All shifts" description="Future entries are included in projected cap warnings." actions={<Link href="/shifts/new"><Button><CalendarClock className="size-4" />Add shift</Button></Link>} />
    <Card>
      <CardContent className="p-2 sm:p-3">{shifts?.length ? shifts.map((shift) => {
        const job = Array.isArray(shift.jobs) ? shift.jobs[0] : shift.jobs;
        const duration = Math.round((new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) / 60000);
        const future = new Date(shift.starts_at) > new Date();

        return <div key={shift.id} className="flex flex-wrap items-center gap-4 rounded-2xl p-3.5 transition-colors hover:bg-[var(--surface-subtle)] sm:p-4">
          <span className="grid size-10 place-items-center rounded-xl" style={{ background: `${job?.color ?? "#98a2b3"}22`, color: job?.color ?? "#98a2b3" }}><Clock3 className="size-4" /></span>
          <div className="min-w-48 flex-1"><p className="font-semibold">{job?.name ?? "Archived job"}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">{formatInTimeZone(shift.starts_at, profile.time_zone, "EEE, MMM d · h:mm a")} – {formatInTimeZone(shift.ends_at, profile.time_zone, "h:mm a")}</p>{shift.notes && <p className="mt-1.5 line-clamp-1 text-sm text-[var(--muted-foreground)]">{shift.notes}</p>}</div>
          <span className="rounded-xl bg-[var(--surface-subtle)] px-3 py-1.5 text-sm font-semibold">{formatMinutes(duration)}</span>
          <Badge variant={future ? "default" : "muted"} className="rounded-xl px-3 py-1.5">{future ? "Scheduled" : "Logged"}</Badge>
          <Link href={`/shifts/${shift.id}/edit`} className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]">Edit</Link>
          {job && !job.archived_at && <Link href={duplicateHref(shift, profile.time_zone)} className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]">Duplicate</Link>}
          <form action={deleteShift}><input type="hidden" name="id" value={shift.id} /><ConfirmSubmit label="Delete" confirmLabel="Delete shift?" /></form>
        </div>;
      }) : <p className="p-10 text-center text-sm text-[var(--muted-foreground)]">No shifts yet.</p>}</CardContent>
    </Card>
  </AppShell>;
}
