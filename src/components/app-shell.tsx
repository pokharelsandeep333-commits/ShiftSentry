"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChartNoAxesCombined, ClipboardClock, Moon, Plus, Settings, ShieldCheck, Sun, BriefcaseBusiness } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/", label: "Overview", icon: ChartNoAxesCombined },
  { href: "/shifts", label: "Shifts", icon: ClipboardClock },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle color theme">
    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
  </Button>;
}

export function AppShell({ children, isAdmin = false, isDemo = false }: { children: React.ReactNode; isAdmin?: boolean; isDemo?: boolean }) {
  const pathname = usePathname();
  return <div className="min-h-screen bg-[var(--background)] lg:grid lg:grid-cols-[250px_1fr]">
    <aside className="hidden border-r bg-[var(--card)] p-4 lg:flex lg:flex-col">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2 pt-2 text-lg font-bold tracking-tight"><span className="grid size-9 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]"><CalendarDays className="size-5" /></span>ShiftSaaS</Link>
      <nav className="space-y-1">
        {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--muted)]", pathname === href && "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]")}><Icon className="size-4" />{label}</Link>)}
        {isAdmin && <Link href="/admin" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--muted)]", pathname.startsWith("/admin") && "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]")}><ShieldCheck className="size-4" />Admin</Link>}
      </nav>
      <div className="mt-auto rounded-lg bg-[var(--muted)] p-3 text-xs text-[var(--muted-foreground)]">{isDemo ? "Preview mode — connect Supabase to save data." : "Your schedule is private to your account."}</div>
    </aside>
    <div className="min-w-0">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-[color-mix(in_srgb,var(--background)_92%,transparent)] px-4 backdrop-blur lg:px-8">
        <Link href="/" className="font-bold lg:hidden">ShiftSaaS</Link>
        <div className="ml-auto flex items-center gap-2"><ThemeToggle /><Link href="/shifts/new"><Button size="sm"><Plus className="size-4" />Add shift</Button></Link></div>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  </div>;
}
