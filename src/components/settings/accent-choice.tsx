"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { ACCENTS, accentPreference, applyAccent, type AccentId } from "@/lib/accent";
import { cn } from "@/lib/utils";

/**
 * The colour theme: what buttons, links, selection and the active nav item
 * are drawn in on every page, and for Wasp and Creamy the backgrounds, cards
 * and text too. The list and its contrast
 * rules live in `src/lib/accent.ts`; the theme bootstrap restores the choice
 * before first paint, and picking one here sets `<html data-accent>` at once.
 *
 * Native radios, so arrows move the choice and the group is one tab stop. Each
 * swatch shows the theme's two colours (`.accent-swatch`). The server
 * render shows Violet until hydration reads the stored choice, as the theme
 * choice does.
 */
export function AccentChoice() {
  const accent = useSyncExternalStore(accentPreference.subscribe, accentPreference.read, accentPreference.serverSnapshot);

  function choose(next: AccentId) {
    accentPreference.write(next);
    applyAccent(next);
  }

  return <div role="radiogroup" aria-labelledby="accent-choice-label" className="mt-6 grid gap-3 border-t pt-6">
    <p id="accent-choice-label" className="text-sm font-semibold">Colour theme <span className="font-normal text-[var(--muted-foreground)]">· saved on this device</span></p>
    <div className="flex flex-wrap gap-2.5">
      {ACCENTS.map((option) => {
        const selected = accent === option.id;
        return <label key={option.id} className={cn("press group relative inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--primary-soft)]", selected ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]")}>
          <input type="radio" name="accent" value={option.id} checked={selected} onChange={() => choose(option.id)} className="sr-only" />
          <span aria-hidden="true" className="accent-swatch grid size-8 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ "--swatch-a": option.swatch[0], "--swatch-b": option.swatch[1] } as CSSProperties}>
            {selected && <Check className="size-4" strokeWidth={3} />}
          </span>
          {option.label}
        </label>;
      })}
    </div>
  </div>;
}
