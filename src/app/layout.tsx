import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://sentry.sandeeppokharel.com.np"),
  title: "ShiftSentry | Plan work with confidence",
  description: "Track shifts, forecast weekly hours, and stay ahead of every limit.",
  applicationName: "ShiftSentry",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#101318" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
