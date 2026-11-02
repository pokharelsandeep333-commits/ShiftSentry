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
    "> A free work hours tracker for students and anyone with more than one job. It keeps one weekly hour limit across every job (plus an optional cap per job), counts planned shifts straight away, warns at 80% and 90%, refuses a shift that would pass a limit, and estimates take-home pay from the rate, tax and deductions entered for each job.",
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
