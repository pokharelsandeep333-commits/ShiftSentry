import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ServiceWorkerRegistrar } from "@/components/service-worker";

export const metadata: Metadata = {
  metadataBase: new URL("https://sentry.sandeeppokharel.com.np"),
  title: "ShiftSentry | Work hours tracker",
  description: "A work hours tracker for every job: log shifts, forecast weekly hours, and stay under your limit.",
  applicationName: "ShiftSentry",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ShiftSentry", statusBarStyle: "black-translucent" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ShiftSentry",
    title: "ShiftSentry | Work hours tracker",
    description: "A work hours tracker for every job: log shifts, forecast weekly hours, and stay under your limit.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ShiftSentry — Plan work with confidence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ShiftSentry | Work hours tracker",
    description: "A work hours tracker for every job: log shifts, forecast weekly hours, and stay under your limit.",
    images: ["/twitter-image"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#101318" },
  ],
};

/**
 * Applies the saved theme before the first paint.
 *
 * The document used to ship with `class="dark"` hardcoded and no bootstrap, so
 * every load started dark and only flipped once `ThemeProvider` hydrated -- a
 * light-theme user saw a dark flash on every navigation, and the default was
 * dark for everyone whether they had chosen it or not.
 *
 * This runs synchronously in the head, before the body renders, so the class is
 * already correct when the first pixel is drawn. It has to be inline for that:
 * an external script would be another round trip, and the flash is exactly the
 * gap it would open. The CSP does not allow `'unsafe-inline'` scripts, so it
 * carries the per-request nonce from `src/proxy.ts`. Reading it makes every
 * route dynamic, `/offline` included; the service worker caches that page with
 * its CSP header, so the nonce in the cached HTML still matches.
 *
 * It also restores the collapsed desktop sidebar (`data-sidebar` on <html>,
 * styled in globals.css) for the same reason: applied after hydration, the
 * sidebar would open for a frame and then snap shut. The key and its JSON
 * encoding are `createLocalPreference`'s, owned by `SidebarToggle`.
 *
 * The string is a compile-time constant with no interpolation of anything --
 * this is not a channel for user input, which is what the repo's rule about
 * `dangerouslySetInnerHTML` is guarding against.
 */
const THEME_BOOTSTRAP = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  } else {
    document.documentElement.style.colorScheme = 'light';
  }
  if (localStorage.getItem('shiftsentry:sidebar') === '"collapsed"') {
    document.documentElement.dataset.sidebar = 'collapsed';
  }
} catch (e) {}
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html suppressHydrationWarning lang="en" className="h-full antialiased">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider><ToastProvider>{children}<ServiceWorkerRegistrar /></ToastProvider></ThemeProvider>
      </body>
    </html>
  );
}
