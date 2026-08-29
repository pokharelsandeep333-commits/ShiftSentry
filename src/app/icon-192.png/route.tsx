import { brandIconResponse } from "@/lib/brand-icon";

export const contentType = "image/png";

export function GET() {
  return brandIconResponse(192, { maskable: false });
}
