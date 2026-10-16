import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/auth";

/**
 * Every admin page under one menu. The proxy already turns non-admins away
 * from /admin, and each page still calls requireAdmin() itself: a layout is
 * not re-run on navigation between its pages, so it is not the check. This
 * call only keeps the menu from drawing for someone the page will redirect
 * (getSignedInProfile is cached per request, so it costs nothing extra).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <>
    <AdminNav />
    {children}
  </>;
}
