import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SavedToast } from "@/components/saved-toast";
import { GoogleCalendarCard, GoogleCalendarCardSkeleton } from "@/components/settings/google-calendar-card";
import { SettingsForm } from "@/components/settings/settings-form";
import { requireUser } from "@/lib/auth";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { timeZoneOptions } from "@/lib/time-zones";

export const dynamic = "force-dynamic";

const SAVED_MESSAGES: Record<string, string> = { "1": "Settings saved", "google-connected": "Google Calendar connected", "google-disconnected": "Google Calendar disconnected" };
const GOOGLE_PROBLEMS: Record<string, string> = {
  denied: "Google Calendar was not connected: access was not allowed.",
  scopes: "Google Calendar was not connected: both calendar permissions are needed. Try again and leave both ticked.",
  expired: "That Google sign-in expired. Try connecting again.",
  failed: "Couldn't connect Google Calendar. Try again in a moment.",
  busy: "Too many connection attempts. Wait a few minutes and try again.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string | string[]; google?: string | string[] }> }) {
  const [profile, { saved, google }] = await Promise.all([requireUser(), searchParams]);
  const savedMessage = typeof saved === "string" ? SAVED_MESSAGES[saved] : undefined;
  const googleProblem = typeof google === "string" ? GOOGLE_PROBLEMS[google] : undefined;

  return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    {googleProblem && <SavedToast message={googleProblem} clearParams={["google"]} />}
    <PageHeader title="Settings" description="Your time zone and week-start day determine how every cap is calculated." />
    <div className="grid gap-6">
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
      {isGoogleCalendarEnabled() && <Suspense fallback={<GoogleCalendarCardSkeleton />}><GoogleCalendarCard userId={profile.id} /></Suspense>}
    </div>
  </>;
}
