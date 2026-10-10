import type { MetadataRoute } from "next";

/**
 * Crawlers may fetch everything. Pages that must stay out of search (the
 * signed-in app, admin, game rooms, auth and API endpoints) carry a
 * `X-Robots-Tag: noindex` header instead (`NOINDEX_PATHS` in next.config.ts).
 * Disallowing them here is what Search Console flagged: a blocked URL can
 * still be indexed from a link, and Google cannot see a noindex it is not
 * allowed to fetch.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://sentry.sandeeppokharel.com.np/sitemap.xml",
  };
}
