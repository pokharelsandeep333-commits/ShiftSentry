"use client";

import { useTransition } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings, UserRound } from "lucide-react";
import { signOut } from "@/app/actions/auth";

function accountInitial(email: string) {
  return email.trim().charAt(0).toUpperCase();
}

export function AccountMenu({ email = "" }: { email?: string }) {
  const initial = accountInitial(email);
  const accountLabel = email || "Account";
  const [isSigningOut, startSignOut] = useTransition();

  function handleSignOut() {
    startSignOut(async () => {
      await signOut();
    });
  }

  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button type="button" aria-label="Open account menu" className="grid size-9 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[var(--card)]/70 text-sm font-bold text-[var(--primary)] shadow-sm transition-[transform,background-color,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_38%,var(--border))] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
        {initial || <UserRound className="size-4" />}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={10} className="z-50 w-64 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--card)]/96 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
        <DropdownMenu.Label className="px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{email ? "Signed in as" : "Account"}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">{accountLabel}</p>
        </DropdownMenu.Label>
        <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
        <DropdownMenu.Item asChild>
          <Link href="/settings" className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--primary-soft)] focus:bg-[var(--primary-soft)]">
            <Settings className="size-4 text-[var(--primary)]" />Settings
          </Link>
        </DropdownMenu.Item>
        <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
        <DropdownMenu.Item disabled={isSigningOut} onSelect={handleSignOut} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--danger)] outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] focus:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] data-[disabled]:cursor-wait data-[disabled]:opacity-60">
          <LogOut className="size-4" />{isSigningOut ? "Logging out…" : "Log out"}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
