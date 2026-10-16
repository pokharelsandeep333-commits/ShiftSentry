export const metadata = { title: "Add a job | ShiftSentry" };

import { BriefcaseBusiness } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/page-header";
import { BackToJobs } from "@/components/jobs/back-to-jobs";
import { nextJobColor } from "@/components/jobs/job-colors";
import { CreateJobForm } from "@/components/jobs/job-forms";
import { SettingsSection } from "@/components/settings/settings-section";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Creating a job. `createJob` redirects to the new job's own page, where
 * deductions and Google Calendar are set: both need the job to exist first.
 */
export default async function NewJobPage() {
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();
  // Only to pick a colour no active job has; if it fails, the palette's first is fine.
  const { data: jobs } = await supabase.from("jobs").select("color").eq("user_id", profile.id).is("archived_at", null);
  const today = formatInTimeZone(new Date(), profile.time_zone, "yyyy-MM-dd");

  return <>
    <BackToJobs />
    <PageHeader title="Add a job" description="Set what the job pays and how many hours you can work there. You can change any of it later." />
    <div className="max-w-3xl">
      <SettingsSection id="new-job" icon={BriefcaseBusiness} title="Job details" description="What the job is called, what it pays, and how much you can work there.">
        <CreateJobForm today={today} defaultColor={nextJobColor((jobs ?? []).map((job) => job.color))} />
      </SettingsSection>
    </div>
  </>;
}
