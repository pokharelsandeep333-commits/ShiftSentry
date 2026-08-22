import { ImageResponse } from "next/og";
import { BrandMarkSvg } from "@/components/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ alignItems: "center", background: "#6d5ce7", borderRadius: 16, display: "flex", height: "100%", justifyContent: "center", width: "100%" }}>
      <BrandMarkSvg size={38} />
    </div>,
    size,
  );
}
