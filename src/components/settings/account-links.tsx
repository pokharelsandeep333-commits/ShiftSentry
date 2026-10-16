import Link from "next/link";
import { ChevronRight, Download, FileText, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The account tools live on /account, outside the workspace, because they must
 * keep working before the agreement is accepted and while the workspace is
 * disabled. These rows are the way in from here; each lands on its own card.
 */
const ACCOUNT_LINKS: { href: string; icon: LucideIcon; title: string; description: string; danger?: boolean }[] = [
  { href: "/account#export", icon: Download, title: "Download your data", description: "A JSON copy of your profile, jobs, shifts, notes and more." },
  { href: "/account#agreements", icon: FileText, title: "Agreements", description: "The Terms and Privacy Policy versions you accepted." },
  { href: "/account#delete", icon: Trash2, title: "Delete your account", description: "Permanently remove your account and records.", danger: true },
];

export function AccountLinks() {
  return <ul className="-mx-2 grid gap-1">
    {ACCOUNT_LINKS.map((item) => {
      const Icon = item.icon;
      return <li key={item.href}>
        <Link href={item.href} className="press group flex min-h-14 items-center gap-3.5 rounded-xl px-2 py-2.5 outline-none hover:bg-[var(--surface-subtle)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", item.danger ? "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]" : "bg-[var(--surface-subtle)] text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]")}><Icon className="size-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className={cn("block text-sm font-semibold", item.danger && "text-[var(--danger)]")}>{item.title}</span>
            <span className="block text-xs leading-5 text-[var(--muted-foreground)]">{item.description}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-[var(--muted-foreground)] transition-[translate] group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </li>;
    })}
  </ul>;
}
