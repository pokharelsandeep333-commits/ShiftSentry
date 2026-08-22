import { ImageResponse } from "next/og";
import { BrandMarkSvg } from "@/components/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ alignItems: "center", background: "#6d5ce7", borderRadius: 40, display: "flex", height: "100%", justifyContent: "center", width: "100%" }}>
      <BrandMarkSvg size={104} />
    </div>,
    size,
  );
}
