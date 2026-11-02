import type { MetadataRoute } from "next";

/**
 * Only the sitemap line. Cloudflare's managed robots.txt is prepended to this
 * file at the edge, and it already carries the `User-agent: *` group (with the
 * Content-Signal line) and the AI-training blocks. A second `User-agent: *`
 * group from here made the file harder to read and the signal look like it
 * applied to one group only. With no rules at all, every crawler may fetch
 * everything, which is also what this file means if the managed block is ever
 * switched off.
 *
 * Pages that must stay out of search (the signed-in app, admin, game rooms,
 * auth and API endpoints) carry a `X-Robots-Tag: noindex` header instead
 * (`NOINDEX_PATHS` in next.config.ts). Disallowing them here is what Search
 * Console flagged: a blocked URL can still be indexed from a link, and Google
 * cannot see a noindex it is not allowed to fetch.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [],
    sitemap: "https://sentry.sandeeppokharel.com.np/sitemap.xml",
  };
}
