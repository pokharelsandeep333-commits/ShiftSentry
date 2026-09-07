"use client";

import { useActionState, useId } from "react";
import { updateGameSettings } from "@/app/actions/game";
import { emptyFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { PremiumSelect, type SelectOption } from "@/components/ui/premium-select";
import { GAME_SETTINGS_BOUNDS, type GameSettings } from "@/lib/game";

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{message}</p>;
}

function range(from: number, to: number): SelectOption[] {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const value = String(from + index);
    return { value, label: value };
  });
}

/**
 * A labelled switch. Native checkbox underneath, so it keeps the browser's own
 * keyboard and assistive-tech behaviour -- the styling is a `peer` overlay
 * rather than a re-implementation.
 */
function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-[var(--card)]/45 p-3.5 transition-colors hover:bg-[var(--surface-subtle)] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--primary-soft)]">
    <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
    {/* The knob is a child of this span, not a sibling of the input, so it
        cannot carry `peer-checked:` itself -- that variant compiles to a
        sibling combinator. The child selector moves it from here instead. */}
    <span aria-hidden className="mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full bg-[var(--muted)] p-0.5 transition-colors peer-checked:bg-[var(--primary)] peer-checked:[&>span]:translate-x-4">
      <span className="size-5 rounded-full bg-white shadow-sm transition-transform duration-200" />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-0.5 block text-xs leading-5 text-[var(--muted-foreground)]">{hint}</span>
    </span>
  </label>;
}

type LobbySettingsFormProps = {
  roomId: string;
  settings: GameSettings;
  categories: { category: string; wordCount: number }[];
};

/**
 * Host-only settings.
 *
 * There is no explicit "saved" banner: the lobby header renders the same
 * settings back as a summary line, and the poll refreshes it, so a successful
 * save shows up as the sentence above the roster changing. A banner would be a
 * second, redundant place to look.
 */
export function LobbySettingsForm({ roomId, settings, categories }: LobbySettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateGameSettings, emptyFormState);
  const ids = useId();

  const categoryOptions: SelectOption[] = [
    { value: "", label: "All categories" },
    ...categories.map(({ category, wordCount }) => ({ value: category, label: `${category} (${wordCount})` })),
  ];

  return <form action={formAction} className="grid gap-4">
    <input type="hidden" name="roomId" value={roomId} />

    <div className="grid gap-2.5">
      <Toggle
        name="decoyMode"
        label="Decoy word"
        hint="The imposter gets a similar word instead of nothing — easier to bluff, harder to spot."
        defaultChecked={settings.decoyMode}
      />
      <Toggle
        name="categoryHint"
        label="Show the imposter the category"
        hint="They see “Food & Drink” but not the word. Makes a blind imposter less hopeless."
        defaultChecked={settings.categoryHint}
      />
      <Toggle
        name="imposterFinalGuess"
        label="Caught imposter can guess"
        hint="Voted out, they still win by naming the word."
        defaultChecked={settings.imposterFinalGuess}
      />
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="field-label">
        <span id={`${ids}-imposters`}>Imposters</span>
        <PremiumSelect
          name="imposterCount"
          defaultValue={String(settings.imposterCount)}
          options={range(GAME_SETTINGS_BOUNDS.imposterCount.min, GAME_SETTINGS_BOUNDS.imposterCount.max)}
          labelledBy={`${ids}-imposters`}
        />
      </div>
      <div className="field-label">
        <span id={`${ids}-passes`}>Clue passes</span>
        <PremiumSelect
          name="cluePasses"
          defaultValue={String(settings.cluePasses)}
          options={range(GAME_SETTINGS_BOUNDS.cluePasses.min, GAME_SETTINGS_BOUNDS.cluePasses.max)}
          labelledBy={`${ids}-passes`}
        />
      </div>
      <div className="field-label">
        <span id={`${ids}-max`}>Max players</span>
        <PremiumSelect
          name="maxPlayers"
          defaultValue={String(settings.maxPlayers)}
          options={range(GAME_SETTINGS_BOUNDS.maxPlayers.min, GAME_SETTINGS_BOUNDS.maxPlayers.max)}
          labelledBy={`${ids}-max`}
        />
      </div>
    </div>

    <div className="field-label">
      <span id={`${ids}-category`}>Draw words from</span>
      <PremiumSelect
        name="categoryFilter"
        defaultValue={settings.categoryFilter ?? ""}
        options={categoryOptions}
        labelledBy={`${ids}-category`}
      />
    </div>

    <FormError message={state.message} />

    <div className="flex justify-end">
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
    </div>
  </form>;
}
