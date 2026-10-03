import type { MetadataRoute } from "next";

/**
 * Crawlers get the public pages only. Everything else is behind sign-in and
 * would only ever show them the login box, so it is not worth their budget.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/integrations/", "/auth/", "/game", "/account-disabled", "/offline"] },
    sitemap: "https://sentry.sandeeppokharel.com.np/sitemap.xml",
  };
}
