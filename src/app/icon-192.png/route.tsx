import { brandIconResponse } from "@/lib/brand-icon";

export function GET() {
  return brandIconResponse(192, { maskable: false });
}
