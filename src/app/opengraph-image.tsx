import { ImageResponse } from "next/og";
import { BrandMarkSvg } from "@/components/brand";

export const alt = "ShiftSentry — Plan work with confidence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ background: "linear-gradient(135deg, #151728 0%, #242043 52%, #6d5ce7 150%)", color: "#ffffff", display: "flex", flexDirection: "column", height: "100%", padding: "72px", position: "relative", width: "100%" }}>
      <div style={{ background: "rgba(255, 255, 255, 0.08)", borderRadius: 999, display: "flex", height: 440, position: "absolute", right: -80, top: -130, width: 440 }} />
      <div style={{ alignItems: "center", display: "flex", gap: 22 }}>
        <div style={{ alignItems: "center", background: "#6d5ce7", borderRadius: 28, display: "flex", height: 92, justifyContent: "center", width: 92 }}>
          <BrandMarkSvg size={52} />
        </div>
        <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-1.8px" }}>ShiftSentry</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <span style={{ color: "#c8c0ff", fontSize: 24, fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase" }}>WORK HOURS, CLEARLY</span>
        <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: "-3px", lineHeight: 1.04, marginTop: 22 }}>Plan work with confidence.</span>
        <span style={{ color: "#d7d5e9", fontSize: 28, lineHeight: 1.4, marginTop: 20 }}>Track shifts, forecast weekly hours, and stay ahead of every limit.</span>
      </div>
    </div>,
    size,
  );
}
