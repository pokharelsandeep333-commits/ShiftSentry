"use client";

import { Suspense, use, useEffect, useRef, useState, useSyncExternalStore, ViewTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChevronRight, CircleHelp, ClipboardClock, Drama, FileText, Lock, Mail, Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, Scale, Settings, ShieldCheck, Sun, X } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { createLocalPreference } from "@/lib/local-preference";
import { cn, formatMinutes } from "@/lib/utils";
import { limitPosition, type WeekMeter } from "@/lib/week-meter";
import { Button, buttonVariants } from "@/components/ui/button";
import { AccountMenu } from "@/components/account-menu";
import { Brand, BrandMark } from "@/components/brand";
import { LEGAL_CONTACT_EMAIL } from "@/components/legal-page";
import dashboardShell from "./quiet-dashboard-shell.module.css";

/**
 * The work the app is for. These five are the bottom tab bar on a phone, where
 * there is room for exactly this many thumb-sized targets and no more.
 */
const navigation = [
  { href: "/", label: "Overview", icon: ChartNoAxesCombined },
  { href: "/shifts", label: "Shifts", icon: ClipboardClock },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The menus -- the drawer on a phone, the sidebar on a desktop -- carry one
 * more entry than the bottom bar.
 *
 * Imposter is a diversion, not part of tracking your hours, so it does not
 * belong in the five permanent tabs a phone shows over every page. Putting it
 * only in the drawer would hide it from desktop entirely, since the drawer is
 * `lg:hidden` and the sidebar takes over there -- so "menu" means both of them,
 * and the bottom bar is the one place it stays out of.
 */
const menuNavigation = [
  ...navigation,
  { href: "/game", label: "Imposter", icon: Drama },
];

const ADMIN_ITEM = { href: "/admin", label: "Admin", icon: ShieldCheck };

/** The desktop rail, top to bottom: the work, then the extras, then Settings at the foot. */
const railMainNavigation = navigation.filter((item) => item.href !== "/settings");
const railExtraNavigation = menuNavigation.filter((item) => item.href === "/game");
const railSettings = navigation.filter((item) => item.href === "/settings");

type NavigationItem = typeof navigation[number];

/**
 * The page within a section, for the header's breadcrumb: a shift-log filter,
 * a form, or an admin sub-page. Null on a section's own page.
 */
const SHOW_LABELS: Record<string, string> = { upcoming: "Upcoming", worked: "Worked" };
function pageLabel(section: NavigationItem, pathname: string, show: string | null) {
  if (pathname === "/pay-periods") return "Pay periods";
  if (pathname.endsWith("/new")) return "New";
  if (pathname.endsWith("/edit")) return "Edit";
  if (pathname === "/shifts" && show) return SHOW_LABELS[show] ?? null;
  if (section.href === "/admin" && pathname !== "/admin") {
    const segment = pathname.split("/")[2] ?? "";
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  }
  return null;
}

/**
 * A nested route lights its section: /shifts/new and /shifts/123/edit both keep
 * "Shifts" active. Only "/" matches exactly, or it would light on every page.
 * Used by all three navigations -- the sidebar and drawer used to compare the
 * path exactly, so opening a form left nothing highlighted.
 */
function isNavigationActive(pathname: string, href: string) {
  // Pay-period history is opened from the dashboard, so it belongs to Overview.
  if (href === "/") return pathname === "/" || pathname === "/pay-periods";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Which way a nav link's page should slide, by menu order: further down the
 * menu slides in from the right, further up from the left. The template in
 * `src/app/(app)/template.tsx` maps these types to animations. Untagged (the
 * current section, or from a page outside the menu) it simply fades through.
 */
const NAV_FORWARD = ["nav-forward"];
const NAV_BACK = ["nav-back"];

function navDirection(items: NavigationItem[], pathname: string, index: number) {
  const current = items.findIndex((item) => isNavigationActive(pathname, item.href));
  if (current < 0 || current === index) return undefined;
  return index > current ? NAV_FORWARD : NAV_BACK;
}

/**
 * The active link's highlight. It is rendered only in the active link and
 * carries the same name wherever it is, so on a page change the browser moves
 * it from the old link to the new one (`.nav-pill` in globals.css). Each
 * navigation passes its own name, and the drawer none: two elements holding one
 * name at once abort the whole transition.
 */
function NavPill({ name, className }: { name?: string; className: string }) {
  const pill = <span aria-hidden="true" className={cn("app-nav-highlight absolute inset-0 -z-10", className)} />;
  return name ? <ViewTransition name={name} share="nav-pill" default="none">{pill}</ViewTransition> : pill;
}

/**
 * The header's controls share one shape: a 36px circle from md, like the
 * landing bar's, and 44px below it, the touch-target floor. Ghost until
 * hovered. The one filled control is Add shift, and it does not glow: the
 * header sits on every page, so nothing in it should shout.
 */
const headerIconButton = "size-11 shrink-0 rounded-full md:size-9";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return <Button variant="ghost" size="icon" className={headerIconButton} onClick={() => setTheme(isDark ? "light" : "dark")} aria-label="Toggle color theme">
    {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
  </Button>;
}

/**
 * The desktop sidebar's collapsed state. The look is CSS keyed on
 * `<html data-sidebar="collapsed">` (globals.css), and the theme bootstrap in
 * `src/app/layout.tsx` sets that attribute from this same key before the first
 * paint, so a collapsed sidebar never flashes open on load. That is also why
 * the attribute is written here on click and never from an effect: the first
 * client render uses the server snapshot ("expanded"), and an effect syncing
 * it would open the sidebar for a frame on every load.
 */
const SIDEBAR_KEY = "shiftsentry:sidebar";
const sidebarPreference = createLocalPreference<"expanded" | "collapsed">(SIDEBAR_KEY, "expanded", (value) => (value === "expanded" || value === "collapsed" ? value : null));

function SidebarToggle() {
  const collapsed = useSyncExternalStore(sidebarPreference.subscribe, sidebarPreference.read, sidebarPreference.serverSnapshot) === "collapsed";
  function toggle() {
    const next = collapsed ? "expanded" : "collapsed";
    if (next === "collapsed") document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    sidebarPreference.write(next);
  }
  return <Button variant="ghost" size="icon" className={cn(headerIconButton, "hidden lg:inline-flex")} onClick={toggle} title="Toggle sidebar" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="desktop-sidebar">
    {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
  </Button>;
}

/** A link in the phone drawer: the rail's plain icon, with its label beside it. */
function NavigationLink({ item, active, transitionTypes, onNavigate }: { item: NavigationItem; active: boolean; transitionTypes?: string[]; onNavigate?: () => void }) {
  const Icon = item.icon;
  return <Link href={item.href} transitionTypes={transitionTypes} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(
    "press group relative isolate flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
    active ? "text-[color-mix(in_srgb,var(--primary)_88%,var(--foreground))]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
  )}>
    {active && <NavPill className="rounded-xl bg-[color-mix(in_srgb,var(--primary)_11%,var(--card))]" />}
    <Icon className="size-5" strokeWidth={1.85} />
    {item.label}
  </Link>;
}

/** The rail's tooltip, portalled so a short window's scrolling cannot clip it. */
function useRailTooltip() {
  const [tooltip, setTooltip] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tooltip]);
  return {
    tooltip,
    show: (element: HTMLElement | null) => {
      const bounds = element?.getBoundingClientRect();
      if (bounds) setTooltip({ left: bounds.right + 12, top: bounds.top + bounds.height / 2 });
    },
    hide: () => setTooltip(null),
  };
}

function RailTooltip({ label, position }: { label: string; position: { left: number; top: number } | null }) {
  return position ? createPortal(<span aria-hidden="true" className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--foreground)] px-2.5 py-1.5 text-xs font-medium text-[var(--background)] shadow-[0_10px_24px_-12px_rgb(16_24_40/0.45)]" style={position}>{label}</span>, document.body) : null;
}

/**
 * One section in the sidebar: a single link across both tiers, its icon on the
 * white rail and its name on the grey panel, so the two always line up. When
 * the sidebar is collapsed the name is hidden and returns as a tooltip;
 * Settings, at the foot, is always just its icon.
 */
function SidebarLink({ item, active, transitionTypes, iconOnly = false }: { item: NavigationItem; active: boolean; transitionTypes?: string[]; iconOnly?: boolean }) {
  const Icon = item.icon;
  const ref = useRef<HTMLAnchorElement>(null);
  const { tooltip, show, hide } = useRailTooltip();
  const showIfCollapsed = () => { if (iconOnly || document.documentElement.dataset.sidebar === "collapsed") show(ref.current); };
  return <>
    <Link ref={ref} href={item.href} transitionTypes={transitionTypes} aria-current={active ? "page" : undefined} aria-label={iconOnly ? item.label : undefined} onClick={hide} onMouseEnter={showIfCollapsed} onMouseLeave={hide} onFocus={showIfCollapsed} onBlur={hide} className={cn("group outline-none", dashboardShell.row)}>
      <span className={cn("press relative isolate grid size-10 place-items-center justify-self-center rounded-[11px] transition-colors group-focus-visible:ring-2 group-focus-visible:ring-[var(--primary)]", active ? "text-[color-mix(in_srgb,var(--primary)_88%,var(--foreground))]" : "text-[var(--muted-foreground)] group-hover:bg-[var(--surface-subtle)] group-hover:text-[var(--foreground)]")}>
        {active && <NavPill name="nav-pill-side" className="rounded-[11px] bg-[color-mix(in_srgb,var(--primary)_11%,var(--card))]" />}
        <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
      </span>
      {!iconOnly && <span className={cn(dashboardShell.label, active ? "bg-[color-mix(in_srgb,var(--primary)_11%,var(--card))] font-semibold text-[color-mix(in_srgb,var(--primary)_88%,var(--foreground))]" : "text-[var(--muted-foreground)] group-hover:bg-[var(--surface-subtle)] group-hover:text-[var(--foreground)]")}>{item.label}</span>}
    </Link>
    <RailTooltip label={item.label} position={tooltip} />
  </>;
}

/** Support and the public pages, which otherwise only the landing's footer links. */
const HELP_LINKS = [
  { label: "Contact support", href: `mailto:${LEGAL_CONTACT_EMAIL}`, icon: Mail },
  { label: "Privacy", href: "/privacy", icon: Lock },
  { label: "Terms", href: "/terms", icon: FileText },
  { label: "Open-source licenses", href: "/open-source-licenses", icon: Scale },
] as const;

/** Help, under Settings: an icon like it, opening a short menu beside the rail. */
function RailHelp() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { tooltip, show, hide } = useRailTooltip();
  return <DropdownMenu.Root modal={false} open={open} onOpenChange={(next) => { setOpen(next); hide(); }}>
    <div className={dashboardShell.row}>
      <DropdownMenu.Trigger asChild>
        <button ref={ref} type="button" aria-label="Help" onMouseEnter={() => { if (!open) show(ref.current); }} onMouseLeave={hide} onBlur={hide} className="group press grid size-10 place-items-center justify-self-center rounded-[11px] text-[var(--muted-foreground)] outline-none transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] data-[state=open]:bg-[var(--surface-subtle)] data-[state=open]:text-[var(--foreground)]">
          <CircleHelp aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
        </button>
      </DropdownMenu.Trigger>
    </div>
    <RailTooltip label="Help" position={tooltip} />
    <DropdownMenu.Portal>
      <DropdownMenu.Content side="right" align="end" sideOffset={14} className="z-50 w-60 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-2xl shadow-black/15 outline-none menu-pop">
        {HELP_LINKS.map((link, index) => <DropdownMenu.Item key={link.href} asChild>
          <a href={link.href} className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--surface-subtle)] focus:bg-[var(--surface-subtle)]", index === 1 && "mt-1 border-t border-[var(--border)] pt-3.5")}>
            <link.icon aria-hidden="true" className="size-4 text-[var(--muted-foreground)]" />{link.label}
          </a>
        </DropdownMenu.Item>)}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/** Where you are, from lg: the section, then the page within it when there is one. */
function Breadcrumb({ section, pathname }: { section: NavigationItem; pathname: string }) {
  const leaf = pageLabel(section, pathname, useSearchParams().get("show"));
  return <p className="hidden min-w-0 items-center gap-1.5 font-display text-[15px] font-semibold leading-6 tracking-[-0.02em] lg:flex">
    {leaf ? <Link href={section.href} className="truncate py-0.5 pr-0.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">{section.label}</Link> : <span className="truncate py-0.5 pr-0.5">{section.label}</span>}
    {leaf && <><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--muted-foreground)]" /><span className="truncate py-0.5 pr-0.5">{leaf}</span></>}
  </p>;
}

function BottomNavigationLink({ item, active, transitionTypes }: { item: NavigationItem; active: boolean; transitionTypes?: string[] }) {
  const Icon = item.icon;

  return <Link href={item.href} transitionTypes={transitionTypes} aria-current={active ? "page" : undefined} className={cn(
    "press flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 pb-1.5 pt-2 text-[11px] font-medium leading-none",
    active ? "text-[color-mix(in_srgb,var(--primary)_88%,var(--foreground))]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
  )}>
    <span className="relative isolate grid h-7 w-12 place-items-center">
      {active && <NavPill name="nav-pill-bar" className="rounded-full bg-[color-mix(in_srgb,var(--primary)_9%,var(--card))]" />}
      <Icon className="size-5" strokeWidth={1.75} />
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
 * Admin stays in the drawer; these five are the everyday destinations.
 */
function BottomNavigation({ pathname }: { pathname: string }) {
  return <nav aria-label="Primary" className="app-bottom-bar fixed inset-x-0 bottom-0 z-30 border-t bg-[var(--card)]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
    <div className="mx-auto flex max-w-md items-stretch gap-1 px-2 py-1">
      {navigation.map((item, index) => <BottomNavigationLink key={item.href} item={item} active={isNavigationActive(pathname, item.href)} transitionTypes={navDirection(navigation, pathname, index)} />)}
    </div>
  </nav>;
}

function MobileNavigation({ pathname, isAdmin }: { pathname: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const shouldRestoreFocus = useRef(false);
  const mobileItems = isAdmin ? [...menuNavigation, ADMIN_ITEM] : menuNavigation;

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
    <Button ref={menuTriggerRef} variant="ghost" size="icon" className={cn(headerIconButton, "lg:hidden")} onClick={() => setOpen(true)} aria-label="Open navigation menu" aria-expanded={open} aria-controls="mobile-navigation"><Menu className="size-5" /></Button>
    {/* The header wrapping this trigger sets `backdrop-blur`, which makes it the
        containing block for `position: fixed` descendants. Rendered in place, the
        overlay and panel would be clipped to the header box. Portal to `body`. */}
    {open && createPortal(<>
        <button type="button" aria-label="Close navigation menu" className="drawer-scrim fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={() => closeMenu(true)} />
        <aside ref={panelRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Mobile navigation" className="drawer-panel fixed left-0 top-0 z-50 flex h-screen w-[min(22rem,calc(100vw-1rem))] flex-col overflow-y-auto overscroll-contain border-r border-[color-mix(in_srgb,var(--primary)_25%,var(--border))] bg-[var(--card)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl shadow-black/30 supports-[height:100dvh]:h-[100dvh] lg:hidden">
          <div className="flex items-center justify-between px-2 py-2">
            <Link href="/" onClick={() => closeMenu()} aria-label="Go to ShiftSentry overview"><Brand /></Link>
            <Button ref={closeButtonRef} variant="ghost" size="icon" className="size-11 sm:size-10" onClick={() => closeMenu(true)} aria-label="Close navigation menu"><X className="size-5" /></Button>
          </div>
          <nav className="mt-6 space-y-1" aria-label="Mobile navigation">
            {mobileItems.map((item, index) => <NavigationLink key={item.href} item={item} active={isNavigationActive(pathname, item.href)} transitionTypes={navDirection(mobileItems, pathname, index)} onNavigate={() => closeMenu()} />)}
          </nav>
          <nav aria-label="Help" className="mt-auto border-t pt-3">
            {HELP_LINKS.map((link) => <a key={link.href} href={link.href} onClick={() => closeMenu()} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--muted-foreground)] outline-none hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><link.icon aria-hidden="true" className="size-4" />{link.label}</a>)}
          </nav>
        </aside>
      </>, document.body)}
  </>;
}

// The raw amber and coral tokens are fill colours: as 14px text on white they
// fall to 2.2:1 and 3.7:1. Mixed toward the ink they clear 4.5:1 in light mode,
// and in dark mode the mix only pales them against the dark card.
const METER_TONE = { calm: "text-[var(--foreground)]", warning: "text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]", danger: "text-[color-mix(in_srgb,var(--danger)_70%,var(--foreground))]" } as const;

function meterNote(meter: WeekMeter) {
  if (meter.limitMinutes === null) return "No weekly limit";
  const over = meter.plannedMinutes - meter.limitMinutes;
  return over > 0 ? `${formatMinutes(over)} over` : `${formatMinutes(-over)} left`;
}

/**
 * The week against its limit, on every page: the product's one number, kept
 * where the eye starts. Job colours fill both worked and planned time,
 * and the figure turns amber from 80% and coral at the
 * limit -- the dashboard's ladder, from the same total.
 */
function WeekMeterLink({ weekMeter }: { weekMeter: Promise<WeekMeter | null> }) {
  const meter = use(weekMeter);
  if (!meter) return null;
  const tick = limitPosition(meter);
  const summary = meter.limitMinutes === null
    ? `This week: ${formatMinutes(meter.plannedMinutes)} planned, no weekly limit set. Open overview.`
    : `This week: ${formatMinutes(meter.plannedMinutes)} of ${formatMinutes(meter.limitMinutes)} planned, ${meterNote(meter)}. Open overview.`;

  return <Link href="/" aria-label={summary} className="group flex h-9 min-w-0 items-center gap-3 rounded-full px-3.5 transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
    <span aria-hidden="true" className="whitespace-nowrap text-xs font-medium text-[var(--muted-foreground)]">This week</span>
    <span aria-hidden="true" className="relative flex h-2 w-24 shrink-0 gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] lg:w-32 xl:w-44 2xl:w-56">
      {meter.segments.map((segment) => <span key={`${segment.jobId}-${segment.scheduled}`} title={`${segment.name}: ${formatMinutes(segment.minutes)} ${segment.scheduled ? "planned" : "worked"}`} className="h-full rounded-full" style={{ width: `${segment.widthPercent}%`, background: segment.color }} />)}
      {tick !== null && tick < 100 && <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-[var(--foreground)]" style={{ left: `${tick}%` }} />}
    </span>
    <span aria-hidden="true" className="whitespace-nowrap font-display text-sm font-semibold tabular-nums">
      <span className={METER_TONE[meter.tone]}>{formatMinutes(meter.plannedMinutes)}</span>
      {meter.limitMinutes !== null && <span className="font-medium text-[var(--muted-foreground)]"> / {formatMinutes(meter.limitMinutes)}</span>}
    </span>
    <span aria-hidden="true" className={cn("hidden whitespace-nowrap text-xs font-medium xl:inline", meter.tone === "calm" ? "text-[var(--muted-foreground)]" : METER_TONE[meter.tone])}>{meterNote(meter)}</span>
  </Link>;
}

function WeekMeterPlaceholder() {
  return <span aria-hidden="true" className="flex h-9 items-center gap-3 px-3.5">
    <span className="text-xs font-medium text-[var(--muted-foreground)]">This week</span>
    <span className="h-2 w-24 rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] lg:w-32 xl:w-44 2xl:w-56" />
  </span>;
}

export function AppShell({ children, isAdmin = false, isDemo = false, userEmail, userName, weekMeter }: { children: React.ReactNode; isAdmin?: boolean; isDemo?: boolean; userEmail?: string; userName?: string | null; weekMeter?: Promise<WeekMeter | null> }) {
  const pathname = usePathname();
  const railExtras = isAdmin ? [...railExtraNavigation, ADMIN_ITEM] : railExtraNavigation;
  const railItems = [...railMainNavigation, ...railExtras, ...railSettings];
  const section = railItems.find((item) => isNavigationActive(pathname, item.href));
  const sidebarLink = (item: NavigationItem, iconOnly = false) => <SidebarLink key={item.href} item={item} iconOnly={iconOnly} active={isNavigationActive(pathname, item.href)} transitionTypes={navDirection(railItems, pathname, railItems.indexOf(item))} />;

  return <div className="app-canvas app-frame min-h-screen lg:grid lg:grid-cols-[296px_minmax(0,1fr)]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-[var(--primary)] focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-[var(--primary-foreground)] focus:shadow-2xl focus:shadow-[var(--primary-glow)]">Skip to content</a>
    {/* No `backdrop-blur` on the sidebar or the header bar: neither overlays
        scrolling content (the sidebar has its own grid column, the header is
        static), so a blur would sample only the flat canvas while costing a
        filter on every scroll frame. The bottom bar keeps its blur, being the
        one layer that genuinely sits over the page. */}
    <aside id="desktop-sidebar" className={cn("app-sidebar hidden p-2 lg:flex", dashboardShell.sidebar)}>
      {/* Two tiers in one floating card: icons on a white rail, their names on
          an inset grey panel that collapsing hides. Each row is one link. */}
      <div className={cn("flex w-full flex-col border bg-[var(--card)]", dashboardShell.sidebarCard)}>
        <span aria-hidden="true" className={dashboardShell.panel} />
        <div className={cn(dashboardShell.row, "mb-4")}>
          <Link href="/" aria-label="Go to ShiftSentry overview" className="justify-self-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><BrandMark /></Link>
          <p className={cn(dashboardShell.identity, "font-display text-[17px] font-semibold tracking-[-0.02em]")}>ShiftSentry</p>
        </div>
        <nav aria-label="Main navigation" className={dashboardShell.navigation}>
          <div className={dashboardShell.group}>{railMainNavigation.map((item) => sidebarLink(item))}</div>
          <div className={dashboardShell.group}>{railExtras.map((item) => sidebarLink(item))}</div>
          <div className={cn(dashboardShell.group, dashboardShell.foot)}>{railSettings.map((item) => sidebarLink(item, true))}<RailHelp /></div>
        </nav>
      </div>
    </aside>
    <div className="min-w-0">
      {/* Left and right groups both flex from zero, so the week meter sits on
          the bar's true centre. 56px tall and, from lg, 8px down so its top
          lines up with the sidebar card's. The calendar page's
          `100dvh - 6rem` counts this: change both together. The account
          avatar sits at the bar's right end at every width. */}
      <header className="px-3 pt-3 sm:px-5 lg:px-6 lg:pt-2"><div className="mx-auto flex h-14 max-w-[96rem] items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-2.5">
        <div className="flex min-w-0 flex-auto items-center gap-1 sm:gap-2 md:flex-1 md:basis-0">
          <SidebarToggle />
          <MobileNavigation pathname={pathname} isAdmin={isAdmin} />
          <Link href="/" className="flex h-11 min-w-0 items-center lg:hidden" aria-label="Go to ShiftSentry overview"><Brand size="compact" className="gap-2 max-[379px]:[&>span:last-child]:hidden" /></Link>
          {section && <Suspense fallback={<p className="hidden truncate py-0.5 pr-0.5 font-display text-[15px] font-semibold leading-6 tracking-[-0.02em] lg:block">{section.label}</p>}><Breadcrumb section={section} pathname={pathname} /></Suspense>}
        </div>
        {weekMeter && <div className="hidden min-w-0 md:block"><Suspense fallback={<WeekMeterPlaceholder />}><WeekMeterLink weekMeter={weekMeter} /></Suspense></div>}
        <div className="flex min-w-0 flex-none items-center justify-end gap-1 sm:gap-2 md:flex-1 md:basis-0">
          <ThemeToggle />
          <Link href="/shifts/new" aria-label="Add shift" className={cn(buttonVariants(), "size-11 rounded-full p-0 shadow-none hover:shadow-none sm:w-auto sm:px-4 md:h-9")}><Plus className="size-4" /><span className="hidden sm:inline">Add shift</span></Link>
          {!isDemo && <AccountMenu email={userEmail} name={userName} />}
        </div>
      </div></header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[96rem] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none sm:p-6 lg:p-8 lg:pb-12">{children}</main>
      <BottomNavigation pathname={pathname} />
    </div>
  </div>;
}
