import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SavedToast } from "@/components/saved-toast";
import { SettingsForm } from "@/components/settings/settings-form";
import { requireUser } from "@/lib/auth";
import { timeZoneOptions } from "@/lib/time-zones";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string | string[] }> }) {
  const [profile, { saved }] = await Promise.all([requireUser(), searchParams]);

  return <>
    {saved === "1" && <SavedToast message="Settings saved" />}
    <PageHeader eyebrow="Preferences" title="Settings" description="Your time zone and week-start day determine how every cap is calculated." />
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Work schedule</CardTitle></CardHeader>
      <CardContent>
        <SettingsForm
          displayName={profile.display_name ?? ""}
          timeZone={profile.time_zone}
          timeZones={timeZoneOptions(profile.time_zone)}
          weekStartsOn={profile.week_starts_on}
          globalWeeklyLimitMinutes={profile.global_weekly_limit_minutes}
        />
      </CardContent>
    </Card>
  </>;
}
