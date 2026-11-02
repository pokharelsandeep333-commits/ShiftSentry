import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { LEGAL_VERSION } from "@/lib/legal";

const origin = "https://sentry.sandeeppokharel.com.np";

/** Bump when the landing's or the about page's text changes. */
const LANDING_UPDATED = "2026-11-02";
const ABOUT_UPDATED = "2026-11-02";

/**
 * The pages a signed-out visitor can read. `/welcome` is left out on purpose:
 * it is what `/` renders for them, and its canonical points back at `/`.
 *
 * `lastModified` is the date the text last changed, never the build time:
 * Google only trusts a lastmod that proves accurate. The legal pages change
 * with the legal version, whose id starts with its date. The license page
 * changes with the dependencies, which no date here tracks, so it has none.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const legalUpdated = LEGAL_VERSION.slice(0, 10);
  return [
    { url: `${origin}/`, lastModified: LANDING_UPDATED, changeFrequency: "weekly", priority: 1 },
    ...GUIDES.map((guide) => ({ url: `${origin}/guides/${guide.slug}`, lastModified: guide.updated, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${origin}/about`, lastModified: ABOUT_UPDATED, changeFrequency: "yearly", priority: 0.5 },
    { url: `${origin}/login`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${origin}/privacy`, lastModified: legalUpdated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/terms`, lastModified: legalUpdated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/cookies`, lastModified: legalUpdated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/open-source-licenses`, changeFrequency: "monthly", priority: 0.2 },
  ];
}
