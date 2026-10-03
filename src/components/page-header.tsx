import type { ReactNode } from "react";

/**
 * Every app page's heading. No kicker above the title: a small uppercase label
 * over a heading only repeated it ("Preferences" over Settings) and was the
 * most template-looking thing on each page. The title carries itself; anything
 * a label used to say that the title does not belongs in the description.
 */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
      {description && <p className="mt-2.5 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>}
    </div>
    {actions && <div className="shrink-0">{actions}</div>}
  </div>;
}
