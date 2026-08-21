import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PremiumSelect } from "@/components/ui/premium-select";
import { requireUser } from "@/lib/auth";
import { updateSettings } from "@/app/actions/work";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const timeZones = ["America/Chicago", "America/New_York", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "UTC"];

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await requireUser();
  const selectedTimeZones = [...new Set([profile.time_zone, ...timeZones])];

  return <AppShell isAdmin={profile.role === "ADMIN"}>
    <PageHeader eyebrow="Preferences" title="Settings" description="Your time zone and week-start day determine how every cap is calculated." />
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Work schedule</CardTitle></CardHeader>
      <CardContent><form action={updateSettings} className="grid gap-5">
        <label className="field-label"><span>Display name</span><input name="displayName" defaultValue={profile.display_name ?? ""} maxLength={100} className="field-control" /></label>
        <div className="field-label"><span id="time-zone-label">Time zone</span><PremiumSelect name="timeZone" defaultValue={profile.time_zone} options={selectedTimeZones.map((zone) => ({ value: zone, label: zone }))} labelledBy="time-zone-label" /></div>
        <div className="field-label"><span id="week-start-label">Week starts on</span><PremiumSelect name="weekStartsOn" defaultValue={String(profile.week_starts_on)} options={weekdays.map((day, value) => ({ value: String(value), label: day }))} labelledBy="week-start-label" /></div>
        <label className="field-label"><span>Global weekly limit (hours)</span><input name="globalWeeklyLimitHours" type="number" min={1} max={168} defaultValue={profile.global_weekly_limit_minutes ? profile.global_weekly_limit_minutes / 60 : ""} className="field-control" placeholder="Leave blank for no cap" /></label>
        <div><Button type="submit">Save settings</Button></div>
      </form></CardContent>
    </Card>
  </AppShell>;
}
