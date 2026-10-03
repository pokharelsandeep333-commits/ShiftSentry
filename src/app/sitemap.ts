import type { MetadataRoute } from "next";

const origin = "https://sentry.sandeeppokharel.com.np";

/**
 * The pages a signed-out visitor can read. `/welcome` is left out on purpose:
 * it is what `/` renders for them, and its canonical points back at `/`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/login`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${origin}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
