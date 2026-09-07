import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ServiceWorkerRegistrar } from "@/components/service-worker";

export const metadata: Metadata = {
  metadataBase: new URL("https://sentry.sandeeppokharel.com.np"),
  title: "ShiftSentry | Plan work with confidence",
  description: "Track shifts, forecast weekly hours, and stay ahead of every limit.",
  applicationName: "ShiftSentry",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ShiftSentry", statusBarStyle: "black-translucent" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ShiftSentry",
    title: "ShiftSentry | Plan work with confidence",
    description: "Track shifts, forecast weekly hours, and stay ahead of every limit.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ShiftSentry — Plan work with confidence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ShiftSentry | Plan work with confidence",
    description: "Track shifts, forecast weekly hours, and stay ahead of every limit.",
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
 * gap it would open. The CSP allows `'unsafe-inline'` for scripts, so no change
 * is needed there.
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
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider><ToastProvider>{children}<ServiceWorkerRegistrar /></ToastProvider></ThemeProvider>
      </body>
    </html>
  );
}
