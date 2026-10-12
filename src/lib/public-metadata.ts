import type { Metadata } from "next";

export function publicMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "ShiftSentry", title, description, url: path, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ShiftSentry work hours tracker" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/twitter-image"] },
  };
}
