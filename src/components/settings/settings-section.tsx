import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One section of a settings-style page (/settings, a job's page): an anchor
 * target the section nav scrolls to and focuses (hence `tabIndex={-1}`),
 * holding a card with a heading row. The
 * heading is an h2 under the page's h1, which CardTitle (an h3) would skip.
 * `scroll-mt-6` matches the nav's `top-6`, so a section lands level with it.
 */
export function SettingsSection({ id, icon: Icon, title, description, status, danger = false, children }: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** A badge on the heading row, e.g. the Google connection state. */
  status?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-[1.35rem] outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
    <Card>
      <div className="flex items-start gap-3.5 p-5 sm:p-6">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", danger ? "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]" : "bg-[var(--primary-soft)] text-[var(--primary)]")}>
          <Icon className="size-[1.15rem]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id={`${id}-title`} className="font-display text-[1.05rem] font-semibold">{title}</h2>
            {status}
          </div>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
        </div>
      </div>
      <CardContent>{children}</CardContent>
    </Card>
  </section>;
}

/**
 * A labelled group inside a section, ruled off from the group above it. A div
 * with role="group" rather than a fieldset: a fieldset's legend is laid out
 * outside the grid, which breaks the gap rhythm. `first-of-type`, not `first`: a form with a
 * Server Action starts with React's hidden action input.
 */
export function SettingsGroup({ id, title, description, children, className }: { id: string; title: string; description?: string; children: ReactNode; className?: string }) {
  return <div role="group" aria-labelledby={`${id}-label`} className={cn("grid gap-4 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0", className)}>
    <div>
      <p id={`${id}-label`} className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-0.5 text-xs leading-5 text-[var(--muted-foreground)]">{description}</p>}
    </div>
    {children}
  </div>;
}
