"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, ChartNoAxesCombined, ClipboardClock, Menu, Moon, Plus, Settings, ShieldCheck, Sun, X } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/account-menu";
import { Brand } from "@/components/brand";

const navigation = [
  { href: "/", label: "Overview", icon: ChartNoAxesCombined },
  { href: "/shifts", label: "Shifts", icon: ClipboardClock },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/settings", label: "Settings", icon: Settings },
];

type NavigationItem = typeof navigation[number];

/**
 * The sidebar and drawer match the path exactly, so /shifts/new highlights
 * nothing. That is invisible in a list but obvious in a bottom bar, where one
 * tab is always expected to be lit, so nested routes light their section here.
 */
function isNavigationActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return <Button variant="ghost" size="icon" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label="Toggle color theme">
    {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
  </Button>;
}

function NavigationLink({ item, active, onNavigate }: { item: NavigationItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;

  return <Link href={item.href} onClick={onNavigate} className={cn(
    "group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-[background-color,color,transform] duration-300 hover:translate-x-0.5",
    active ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
  )}>
    <span className={cn("grid size-8 place-items-center rounded-xl transition-colors", active ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-glow)]" : "bg-[var(--surface-subtle)] text-[var(--muted-foreground)] group-hover:bg-[var(--primary-soft)] group-hover:text-[var(--primary)]")}>
      <Icon className="size-4" />
    </span>
    {item.label}
    {active && <span className="absolute right-2 size-1.5 rounded-full bg-[var(--primary)]" />}
  </Link>;
}

function BottomNavigationLink({ item, active }: { item: NavigationItem; active: boolean }) {
  const Icon = item.icon;

  return <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(
    "flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 pb-1.5 pt-2 text-[11px] font-semibold leading-none transition-colors",
    active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
  )}>
    <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-[var(--primary-soft)]")}>
      <Icon className="size-5" />
    </span>
    {item.label}
  </Link>;
}

/**
 * Thumb-reachable navigation for phones and tablets, shown at exactly the width
 * where the sidebar disappears. `env(safe-area-inset-bottom)` keeps the labels
 * clear of the iOS home indicator and the Android gesture bar -- without it the
 * bar looks correct in a browser and gets cropped inside the installed app.
 *
 * Admin stays in the drawer; these four are the everyday destinations.
 */
function BottomNavigation({ pathname }: { pathname: string }) {
  return <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t bg-[var(--background)]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
    <div className="mx-auto flex max-w-md items-stretch gap-1 px-2 py-1">
      {navigation.map((item) => <BottomNavigationLink key={item.href} item={item} active={isNavigationActive(pathname, item.href)} />)}
    </div>
  </nav>;
}

function MobileNavigation({ pathname, isAdmin }: { pathname: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const shouldRestoreFocus = useRef(false);
  const mobileItems = isAdmin ? [...navigation, { href: "/admin", label: "Admin", icon: ShieldCheck }] : navigation;

  function closeMenu(restoreFocus = false) {
    shouldRestoreFocus.current = restoreFocus;
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const menuTrigger = menuTriggerRef.current;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (shouldRestoreFocus.current) {
        shouldRestoreFocus.current = false;
        menuTrigger?.focus();
      }
    };
  }, [open]);

  return <>
    <Button ref={menuTriggerRef} variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation menu" aria-expanded={open} aria-controls="mobile-navigation"><Menu className="size-5" /></Button>
    {/* The header wrapping this trigger sets `backdrop-blur`, which makes it the
        containing block for `position: fixed` descendants. Rendered in place, the
        overlay and panel would be clipped to the header box. Portal to `body`. */}
    {open && createPortal(<>
        <button type="button" aria-label="Close navigation menu" className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={() => closeMenu(true)} />
        <aside ref={panelRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Mobile navigation" className="fixed left-0 top-0 z-50 flex h-screen w-[min(22rem,calc(100vw-1rem))] flex-col overflow-y-auto overscroll-contain border-r border-[color-mix(in_srgb,var(--primary)_25%,var(--border))] bg-[var(--card)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl shadow-black/30 supports-[height:100dvh]:h-[100dvh] lg:hidden">
          <div className="flex items-center justify-between px-2 py-2">
            <Link href="/" onClick={() => closeMenu()} aria-label="Go to ShiftSentry overview"><Brand /></Link>
            <Button ref={closeButtonRef} variant="ghost" size="icon" onClick={() => closeMenu(true)} aria-label="Close navigation menu"><X className="size-5" /></Button>
          </div>
          <nav className="mt-6 space-y-1" aria-label="Mobile navigation">
            {mobileItems.map((item) => <NavigationLink key={item.href} item={item} active={pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin"))} onNavigate={() => closeMenu()} />)}
          </nav>
          <div className="mt-auto rounded-2xl border bg-[var(--surface-subtle)] p-4 text-sm text-[var(--muted-foreground)]">Your schedule is private to your account.</div>
        </aside>
      </>, document.body)}
  </>;
}

export function AppShell({ children, isAdmin = false, isDemo = false, userEmail }: { children: React.ReactNode; isAdmin?: boolean; isDemo?: boolean; userEmail?: string }) {
  const pathname = usePathname();
  const desktopItems = isAdmin ? [...navigation, { href: "/admin", label: "Admin", icon: ShieldCheck }] : navigation;

  return <div className="app-canvas min-h-screen lg:grid lg:grid-cols-[292px_minmax(0,1fr)]">
    <aside className="hidden p-4 lg:flex">
      <div className="premium-card sticky top-4 flex h-[calc(100vh-2rem)] w-full flex-col rounded-[1.75rem] border bg-[var(--card)]/82 p-3.5 backdrop-blur-2xl">
        <Link href="/" className="mb-8 rounded-2xl px-2 py-2"><Brand /></Link>
        <nav className="space-y-1" aria-label="Main navigation">{desktopItems.map((item) => <NavigationLink key={item.href} item={item} active={pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin"))} />)}</nav>
        <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-xs leading-5 text-[var(--muted-foreground)]"><span className="mb-1 block font-semibold text-[var(--foreground)]">{isDemo ? "Preview mode" : "Private workspace"}</span>{isDemo ? "Connect Supabase to save your workspace data." : "Your work schedule stays private to your account."}</div>
      </div>
    </aside>
    <div className="min-w-0">
      <header className="px-3 pt-3 sm:px-5 lg:px-6"><div className="mx-auto flex h-14 max-w-[96rem] items-center gap-1 rounded-[1.25rem] border bg-[var(--background)]/90 px-2 shadow-lg shadow-black/[0.03] backdrop-blur-xl sm:h-16 sm:px-3"><div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2"><MobileNavigation pathname={pathname} isAdmin={isAdmin} /><Link href="/" className="min-w-0 lg:hidden" aria-label="Go to ShiftSentry overview"><Brand size="compact" className="gap-2" /></Link></div><div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5"><ThemeToggle /><Link href="/shifts/new" aria-label="Add shift"><Button size="sm" className="size-9 rounded-xl p-0 sm:h-8 sm:w-auto sm:px-3"><Plus className="size-4" /><span className="hidden sm:inline">Add shift</span></Button></Link>{!isDemo && <AccountMenu email={userEmail} />}</div></div></header>
      <main className="mx-auto max-w-[96rem] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8 lg:pb-12">{children}</main>
      <BottomNavigation pathname={pathname} />
    </div>
  </div>;
}
