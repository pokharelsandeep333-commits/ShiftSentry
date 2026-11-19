"use client";

import { useTransition } from "react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/** Sign out, then a full page load to `/` so nothing signed-in stays in memory (see `signOut`). */
export function SignOutButton({ variant }: { variant: "ghost" | "outline" }) {
  const [pending, startSignOut] = useTransition();
  return <Button type="button" variant={variant} disabled={pending} onClick={() => startSignOut(async () => {
    await signOut();
    window.location.replace("/");
  })}>{pending ? "Signing out…" : "Sign out"}</Button>;
}
