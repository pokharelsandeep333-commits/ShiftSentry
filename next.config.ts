import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/content-security-policy";

// The nonce-less fallback, for the paths the proxy does not match. Every page
// goes through `src/proxy.ts`, which replaces this with the per-request policy.
const fallbackContentSecurityPolicy = contentSecurityPolicy({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  development: process.env.NODE_ENV === "development",
});

// Everything a search engine should crawl but never list: the signed-in app,
// the admin area, the game rooms (their invite links get shared), the auth
// and Google endpoints, and the account-disabled and offline pages. They say
// so themselves with a noindex header rather than being hidden by robots.txt:
// a URL robots.txt blocks can still be indexed from a link, and Google can
// never read the noindex on it (Search Console's "Indexed, though blocked").
// `:path*` matches the bare prefix too.
const NOINDEX_PATHS = [
  "/admin/:path*", "/api/:path*", "/auth/:path*", "/integrations/:path*", "/game/:path*",
  "/shifts/:path*", "/jobs/:path*", "/calendar/:path*", "/settings/:path*",
  "/account-disabled", "/offline",
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    const headers = [
      { key: "Content-Security-Policy", value: fallbackContentSecurityPolicy },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];

    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }

    return [
      { source: "/:path*", headers },
      ...NOINDEX_PATHS.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
    ];
  },
};

export default nextConfig;
