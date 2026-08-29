import type { MetadataRoute } from "next";

/**
 * Web app manifest. Installability is the prerequisite for the Android package
 * too: bubblewrap reads this file to build the Trusted Web Activity, so `name`,
 * `start_url`, `theme_color`, and the 192/512 icons all end up baked into the
 * generated app. Keep `scope` covering every route the app navigates to, or
 * Android opens the rest in a browser tab instead of the installed shell.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ShiftSentry",
    short_name: "ShiftSentry",
    description: "Track shifts, forecast weekly hours, and stay ahead of every limit.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#101318",
    theme_color: "#101318",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
