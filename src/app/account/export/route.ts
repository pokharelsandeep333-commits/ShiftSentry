import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";

const allowExport = createRateLimiter({ limit: 3, windowMs: 60_000 });
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ message: "Sign in to download your account data." }, { status: 401, headers });
  if (!allowExport(user.id)) return NextResponse.json({ message: "Too many downloads. Wait a minute and try again." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  const { data, error: exportError } = await supabase.rpc("export_account_data");
  if (exportError || !data) return NextResponse.json({ message: "The download could not be prepared. Please try again or contact support." }, { status: 503, headers });
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="shiftsentry-account-${new Date().toISOString().slice(0, 10)}.json"` } });
}
