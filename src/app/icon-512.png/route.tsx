import { brandIconResponse } from "@/lib/brand-icon";

export function GET() {
  return brandIconResponse(512, { maskable: false });
}
