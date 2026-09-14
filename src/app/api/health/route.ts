export const dynamic = "force-dynamic";

export function GET() {
  // `commit` is what lets a deploy be verified from outside: Watchtower pulls
  // the new image on its own schedule, and until this matched the merged SHA
  // there was no way to tell the old build from the new one without SSH.
  // Baked in at image build time; null in dev and in a locally built image.
  return Response.json(
    { status: "ok", commit: process.env.GIT_SHA || null },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
