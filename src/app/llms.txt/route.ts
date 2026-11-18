import { GUIDES } from "@/lib/guides";

const origin = "https://sentry.sandeeppokharel.com.np";

export const dynamic = "force-static";

/**
 * `/llms.txt` (llmstxt.org): a Markdown map of the public pages for AI tools
 * that read it. Google Search ignores it. Built from `GUIDES` so it cannot
 * list a guide that is gone, and it states only what the landing does.
 */
export function GET() {
  const body = [
    "# ShiftSentry",
    "",
    "> A free work hours tracker for students and anyone with more than one job. It applies a default weekly cap or the configured break cap across all jobs, alongside optional per-job caps. Planned shifts count toward the cap straight away. ShiftSentry warns as the week approaches the cap, refuses shifts that would exceed it, and estimates take-home pay.",
    "",
    "## Pages",
    "",
    `- [Home and FAQ](${origin}/): what ShiftSentry does, the rules it enforces, and common questions`,
    `- [About](${origin}/about): who makes ShiftSentry and how it runs`,
    "",
    "## Guides",
    "",
    ...GUIDES.map((guide) => `- [${guide.heading}](${origin}/guides/${guide.slug}): ${guide.description}`),
    "",
    "## Policies",
    "",
    `- [Privacy Policy](${origin}/privacy)`,
    `- [Terms of Service](${origin}/terms)`,
    `- [Cookie and Storage Policy](${origin}/cookies)`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
