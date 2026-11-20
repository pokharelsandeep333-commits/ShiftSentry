import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CapShift } from "@/lib/week-meter";

/** Both the overview and the pre-save check include archived jobs and page past PostgREST's row limit. */
export async function readCapShifts(client: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string, start: string, end: string) {
  const rows: (CapShift & { id: string })[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("shifts").select("id,job_id,starts_at,ends_at,jobs!inner(name,color,archived_at)")
      .eq("user_id", userId).lt("starts_at", end).gt("ends_at", start)
      .order("starts_at").order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of data) {
      rows.push({
        id: row.id, jobId: row.job_id, startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at),
        job: { id: row.job_id, name: row.jobs.name, color: row.jobs.color, archived: Boolean(row.jobs.archived_at) },
      });
    }
    if (data.length < pageSize) return rows;
  }
}
