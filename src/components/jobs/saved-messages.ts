/**
 * Confirmation copy for the `?saved=` flag each job mutation redirects with,
 * shared by /jobs and /jobs/[id] because an action lands on one or the other.
 * A slug added here needs its redirect in `src/app/actions/work.ts`, and the
 * reverse.
 */
export const JOB_SAVED_MESSAGES: Record<string, string> = {
  "job-created": "Job created",
  "job-updated": "Job updated",
  "job-archived": "Job archived",
  "job-restored": "Job restored",
  "job-deleted": "Job deleted",
  "deduction-added": "Deduction added",
  "deduction-removed": "Deduction removed",
};

export function jobSavedMessage(saved: string | string[] | undefined) {
  return JOB_SAVED_MESSAGES[Array.isArray(saved) ? saved[0] ?? "" : saved ?? ""];
}
