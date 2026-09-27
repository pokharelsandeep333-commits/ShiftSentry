import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/content-security-policy";

// The nonce-less fallback, for the paths the proxy does not match. Every page
// goes through `src/proxy.ts`, which replaces this with the per-request policy.
const fallbackContentSecurityPolicy = contentSecurityPolicy({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  development: process.env.NODE_ENV === "development",
});

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

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
