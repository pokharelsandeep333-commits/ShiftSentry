"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const CHOICES = [
  { value: "light", label: "Light", icon: Sun, page: "#f7f8fa", card: "#ffffff", line: "#e4e7ec", accent: "#6d5ce7" },
  { value: "dark", label: "Dark", icon: Moon, page: "#101318", card: "#171b22", line: "#303846", accent: "#9486ff" },
] as const;

/**
 * The same theme the header toggle flips, offered where people look for it.
 * Both write the `theme` key through ThemeProvider, so they never disagree. The
 * swatches copy the two themes' --background/--card/--border/--primary values
 * rather than reading the tokens: each previews the other theme
 * too, which the current theme's tokens cannot draw.
 *
 * Native radios, so arrows move the choice and the pair is one tab stop. The
 * server render shows Light, as the header toggle does, until hydration reads
 * the stored choice.
 */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme();

  return <div role="radiogroup" aria-labelledby="theme-choice-label" className="grid gap-3">
    <p id="theme-choice-label" className="text-sm font-semibold">Theme <span className="font-normal text-[var(--muted-foreground)]">· saved on this device</span></p>
    <div className="grid grid-cols-2 gap-3 sm:max-w-md">
      {CHOICES.map((choice) => {
        const selected = theme === choice.value;
        const Icon = choice.icon;
        return <label key={choice.value} className={cn("press group relative grid cursor-pointer gap-2.5 rounded-2xl border p-2.5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--primary-soft)]", selected ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]")}>
          <input type="radio" name="theme" value={choice.value} checked={selected} onChange={() => setTheme(choice.value)} className="sr-only" />
          <span aria-hidden="true" className="grid h-16 grid-cols-[1.1rem_1fr] gap-1.5 rounded-xl border p-1.5" style={{ background: choice.page, borderColor: choice.line }}>
            <span className="rounded-md" style={{ background: choice.card }} />
            <span className="grid content-start gap-1.5 rounded-md p-1.5" style={{ background: choice.card }}>
              <span className="h-1.5 w-2/3 rounded-full" style={{ background: choice.accent }} />
              <span className="h-1.5 w-full rounded-full" style={{ background: choice.line }} />
              <span className="h-1.5 w-4/5 rounded-full" style={{ background: choice.line }} />
            </span>
          </span>
          <span className="flex items-center gap-2 px-1 text-sm font-semibold">
            <Icon className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            {choice.label}
            {selected && <Check className="ml-auto size-4 text-[var(--primary)]" strokeWidth={3} aria-hidden="true" />}
          </span>
        </label>;
      })}
    </div>
  </div>;
}
