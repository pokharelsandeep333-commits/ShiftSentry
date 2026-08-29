import { ImageResponse } from "next/og";
import { BrandMarkSvg } from "@/components/brand";

/**
 * Shared renderer for the PNG icons the manifest points at.
 *
 * `maskable` icons are cropped to whatever shape the launcher prefers -- circle,
 * squircle, rounded square -- so the mark has to sit inside the centre 80% and
 * the brand colour has to bleed to every edge. A maskable icon with rounded
 * corners of its own gets clipped twice and looks chewed.
 */
export function brandIconResponse(size: number, { maskable = false } = {}) {
  return new ImageResponse(
    <div style={{ alignItems: "center", background: "#6d5ce7", borderRadius: maskable ? 0 : size * 0.22, display: "flex", height: "100%", justifyContent: "center", width: "100%" }}>
      <BrandMarkSvg size={Math.round(size * (maskable ? 0.5 : 0.6))} />
    </div>,
    { width: size, height: size },
  );
}
