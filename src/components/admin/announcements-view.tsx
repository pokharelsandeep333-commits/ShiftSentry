import { formatInTimeZone } from "date-fns-tz";
import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnnouncementForm, ClearAnnouncement } from "@/components/admin/announcement-form";

export type AnnouncementRow = { id: string; message: string; tone: string; createdAt: Date; clearedAt: Date | null; author: string | null };

/** Post, replace or clear the site banner, and see what was posted before. `/admin/announcements` loads it. */
export function AnnouncementsView({ live, history, timeZone }: { live: AnnouncementRow | null; history: AnnouncementRow[]; timeZone: string }) {
  const when = (date: Date) => formatInTimeZone(date, timeZone, "MMM d, h:mm a");

  return <>
    <PageHeader title="Announcements" description="A short notice at the top of every signed-in page, for planned maintenance or a known problem. One at a time." />

    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] [&>*]:min-w-0">
      <div className="grid gap-6 self-start">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="size-4 text-[var(--primary)]" aria-hidden="true" />Live now</CardTitle></CardHeader>
          <CardContent>
            {live ? <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="whitespace-pre-line break-words text-sm leading-6">{live.message}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <Badge variant={live.tone === "warning" ? "warning" : "default"}>{live.tone === "warning" ? "Warning" : "Information"}</Badge>
                  Posted {when(live.createdAt)}{live.author && ` by ${live.author}`}
                </div>
              </div>
              <ClearAnnouncement />
            </div> : <p className="text-sm text-[var(--muted-foreground)]">Nothing is showing right now.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{live ? "Replace it" : "Post an announcement"}</CardTitle></CardHeader>
          <CardContent><AnnouncementForm hasLive={Boolean(live)} /></CardContent>
        </Card>
      </div>

      <Card className="self-start">
        <CardHeader><CardTitle>Earlier announcements</CardTitle></CardHeader>
        <CardContent>
          {history.length ? <ol className="grid gap-2">
            {history.map((row) => <li key={row.id} className="rounded-xl bg-[var(--surface-subtle)] px-3.5 py-3">
              <p className="whitespace-pre-line break-words text-sm">{row.message}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{row.tone === "warning" ? "Warning" : "Information"} · {when(row.createdAt)}{row.clearedAt && ` to ${when(row.clearedAt)}`}{row.author && ` · ${row.author}`}</p>
            </li>)}
          </ol> : <p className="text-sm text-[var(--muted-foreground)]">None yet.</p>}
        </CardContent>
      </Card>
    </div>
  </>;
}
