import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>
      {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
      {description && <p className="mt-2.5 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>}
    </div>
    {actions && <div className="shrink-0">{actions}</div>}
  </div>;
}
