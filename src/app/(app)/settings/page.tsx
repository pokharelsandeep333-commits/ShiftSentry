import { Suspense } from "react";
import { CalendarClock, Palette, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SavedToast } from "@/components/saved-toast";
import { AccountLinks } from "@/components/settings/account-links";
import { GoogleCalendarCard, GoogleCalendarCardSkeleton } from "@/components/settings/google-calendar-card";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";
import { SettingsForm } from "@/components/settings/settings-form";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SettingsSection } from "@/components/settings/settings-section";
import { ThemeChoice } from "@/components/settings/theme-choice";
import { requireUser } from "@/lib/auth";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { timeZoneOptions } from "@/lib/time-zones";

export const metadata = { title: "Settings | ShiftSentry" };

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
  const googleOn = isGoogleCalendarEnabled();
  const sections = SETTINGS_SECTIONS.filter((section) => googleOn || section.id !== "google-calendar");

  return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    {googleProblem && <SavedToast message={googleProblem} clearParams={["google"]} />}
    <PageHeader title="Settings" description="Your profile, how your week is counted, connected calendars, and your account." />
    <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8 xl:gap-10">
      <SettingsNav sections={sections} />
      <div className="grid min-w-0 max-w-3xl gap-6">
        <SettingsSection id="week" icon={CalendarClock} title="Profile and week" description="Your name, and the time zone, week and weekly limit every total is measured against.">
          <SettingsForm
            email={profile.email}
            displayName={profile.display_name ?? ""}
            timeZone={profile.time_zone}
            timeZones={timeZoneOptions(profile.time_zone)}
            weekStartsOn={profile.week_starts_on}
            globalWeeklyLimitMinutes={profile.global_weekly_limit_minutes}
          />
        </SettingsSection>

        {googleOn && <Suspense fallback={<GoogleCalendarCardSkeleton />}><GoogleCalendarCard userId={profile.id} /></Suspense>}

        <SettingsSection id="appearance" icon={Palette} title="Appearance" description="How ShiftSentry looks on this device. The moon and sun in the header switch it too.">
          <ThemeChoice />
        </SettingsSection>

        <SettingsSection id="account" icon={ShieldCheck} title="Account and privacy" description="These tools open on their own page and work even when the workspace is locked.">
          <AccountLinks />
        </SettingsSection>
      </div>
    </div>
  </>;
}
