"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ClipboardClock, Menu, Moon, Plus, Settings, ShieldCheck, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/account-menu";

const navigation = [
  { href: "/", label: "Overview", icon: ChartNoAxesCombined },
  { href: "/shifts", label: "Shifts", icon: ClipboardClock },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/settings", label: "Settings", icon: Settings },
];

type NavigationItem = typeof navigation[number];

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
    {active && <motion.span layoutId="navigation-active" className="absolute right-2 size-1.5 rounded-full bg-[var(--primary)]" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
  </Link>;
}

function MobileNavigation({ pathname, isAdmin }: { pathname: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const mobileItems = isAdmin ? [...navigation, { href: "/admin", label: "Admin", icon: ShieldCheck }] : navigation;

  return <>
    <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation menu"><Menu className="size-5" /></Button>
    <AnimatePresence>
      {open && <>
        <motion.button type="button" aria-label="Close navigation menu" className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm lg:hidden" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
        <motion.aside className="fixed inset-y-3 left-3 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-[1.75rem] border border-[color-mix(in_srgb,var(--primary)_25%,var(--border))] bg-[var(--card)]/95 p-3 shadow-2xl shadow-black/30 backdrop-blur-2xl lg:hidden" initial={reduceMotion ? false : { opacity: 0, x: -28, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -28, scale: 0.98 }} transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}>
          <div className="flex items-center justify-between px-2 py-2">
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-3 font-display text-lg font-semibold"><span className="grid size-10 place-items-center rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-glow)]"><CalendarDays className="size-5" /></span>ShiftSaaS</Link>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close navigation menu"><X className="size-5" /></Button>
          </div>
          <nav className="mt-6 space-y-1" aria-label="Mobile navigation">
            {mobileItems.map((item) => <NavigationLink key={item.href} item={item} active={pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin"))} onNavigate={() => setOpen(false)} />)}
          </nav>
          <div className="mt-auto rounded-2xl border bg-[var(--surface-subtle)] p-4 text-sm text-[var(--muted-foreground)]">Your schedule is private to your account.</div>
        </motion.aside>
      </>}
    </AnimatePresence>
  </>;
}

export function AppShell({ children, isAdmin = false, isDemo = false, userEmail }: { children: React.ReactNode; isAdmin?: boolean; isDemo?: boolean; userEmail?: string }) {
  const pathname = usePathname();
  const desktopItems = isAdmin ? [...navigation, { href: "/admin", label: "Admin", icon: ShieldCheck }] : navigation;

  return <div className="app-canvas min-h-screen lg:grid lg:grid-cols-[292px_minmax(0,1fr)]">
    <aside className="hidden p-4 lg:flex">
      <div className="premium-card sticky top-4 flex h-[calc(100vh-2rem)] w-full flex-col rounded-[1.75rem] border bg-[var(--card)]/82 p-3.5 backdrop-blur-2xl">
        <Link href="/" className="mb-8 flex items-center gap-3 rounded-2xl px-2 py-2 font-display text-lg font-semibold tracking-tight"><span className="grid size-10 place-items-center rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-glow)]"><CalendarDays className="size-5" /></span>ShiftSaaS</Link>
        <nav className="space-y-1" aria-label="Main navigation">{desktopItems.map((item) => <NavigationLink key={item.href} item={item} active={pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin"))} />)}</nav>
        <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-xs leading-5 text-[var(--muted-foreground)]"><span className="mb-1 block font-semibold text-[var(--foreground)]">{isDemo ? "Preview mode" : "Private workspace"}</span>{isDemo ? "Connect Supabase to save your workspace data." : "Your work schedule stays private to your account."}</div>
      </div>
    </aside>
    <div className="min-w-0">
      <header className="px-3 pt-3 sm:px-5 lg:px-6"><div className="mx-auto flex h-16 max-w-[96rem] items-center justify-between rounded-[1.25rem] border bg-[var(--background)]/72 px-2.5 shadow-lg shadow-black/[0.03] backdrop-blur-xl sm:px-3"><div className="flex items-center gap-2"><MobileNavigation pathname={pathname} isAdmin={isAdmin} /><Link href="/" className="flex items-center gap-2 font-display font-semibold lg:hidden"><span className="grid size-8 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]"><CalendarDays className="size-4" /></span>ShiftSaaS</Link></div><div className="ml-auto flex items-center gap-1.5"><ThemeToggle /><Link href="/shifts/new"><Button size="sm" className="rounded-xl"><Plus className="size-4" />Add shift</Button></Link>{!isDemo && <AccountMenu email={userEmail} />}</div></div></header>
      <main className="mx-auto max-w-[96rem] p-4 pb-8 sm:p-6 sm:pb-10 lg:p-8 lg:pb-12">{children}</main>
    </div>
  </div>;
}
