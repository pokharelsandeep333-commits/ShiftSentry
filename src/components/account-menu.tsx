"use client";

import { useTransition } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings, UserRound } from "lucide-react";
import { signOut } from "@/app/actions/auth";

/** The display name's first letter when there is one, else the email's. */
function accountInitial(name: string | null | undefined, email: string) {
  return (name?.trim() || email.trim()).charAt(0).toUpperCase();
}

export function AccountMenu({ email = "", name }: { email?: string; name?: string | null }) {
  const initial = accountInitial(name, email);
  const accountLabel = email || "Account";
  const [isSigningOut, startSignOut] = useTransition();

  function handleSignOut() {
    startSignOut(async () => {
      await signOut();
    });
  }

  // Non-modal: a modal menu locks body scroll through react-remove-scroll,
  // which pads <body> by the scrollbar's width to cover the track it expects
  // to have removed. globals.css keeps that track permanently, so the padding
  // only ever shoved the page 15px left for as long as the menu was open.
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild>
      <button type="button" aria-label="Open account menu" className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] font-display text-sm font-semibold text-[var(--primary)] transition-[background-color,box-shadow] duration-200 hover:bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] data-[state=open]:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--primary)] md:size-9">
        {initial || <UserRound className="size-4" />}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={10} className="z-50 w-64 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--card)]/96 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-2xl outline-none menu-pop">
        <DropdownMenu.Label className="px-3 py-2.5">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">{email ? "Signed in as" : "Account"}</p>
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
