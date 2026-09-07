"use client";

import { useActionState, useEffect, useId, useState, useSyncExternalStore } from "react";
import { History, RotateCcw, Settings2 } from "lucide-react";
import { updateGameSettings } from "@/app/actions/game";
import { emptySavedFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { PremiumSelect, type SelectOption } from "@/components/ui/premium-select";
import { useToast } from "@/components/ui/toast-provider";
import { gameSettingsPreference } from "@/lib/game-preferences";
import {
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_BOUNDS,
  IMPOSTER_HINTS,
  IMPOSTER_HINT_LABELS,
  WORD_DIFFICULTIES,
  WORD_DIFFICULTY_LABELS,
  canHideRoles,
  gameSettingsEqual,
  reconcileGameSettings,
  type GameSettings,
  type WordDifficulty,
} from "@/lib/game";
import { cn } from "@/lib/utils";

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{message}</p>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="grid gap-2.5 border-t pt-4 first:border-t-0 first:pt-0">
    <div>
      <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{title}</h4>
      {hint && <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{hint}</p>}
    </div>
    {children}
  </section>;
}

/**
 * A labelled switch. Native checkbox underneath so it keeps the browser's own
 * keyboard and assistive-tech behaviour; the styling is a `peer` overlay rather
 * than a re-implementation. The knob is a child of the track, not a sibling of
 * the input, so it cannot carry `peer-checked:` itself -- that variant compiles
 * to a sibling combinator, hence the child selector on the track.
 */
function Toggle({
  name, label, hint, checked, disabled, onChange,
}: {
  name: string; label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void;
}) {
  return <label className={cn(
    "flex items-start gap-3 rounded-xl border bg-[var(--card)]/45 p-3.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--primary-soft)]",
    disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-[var(--surface-subtle)]",
  )}>
    <input
      type="checkbox"
      name={name}
      className="peer sr-only"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span aria-hidden className="mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full bg-[var(--muted)] p-0.5 transition-colors peer-checked:bg-[var(--primary)] peer-checked:[&>span]:translate-x-4">
      <span className="size-5 rounded-full bg-white shadow-sm transition-transform duration-200" />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-0.5 block text-xs leading-5 text-[var(--muted-foreground)]">{hint}</span>
    </span>
  </label>;
}

/** Segmented control for the small numeric ranges, where a dropdown is overkill. */
function Steps({
  legend, name, min, max, value, onChange,
}: {
  legend: string; name: string; min: number; max: number; value: number; onChange: (next: number) => void;
}) {
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index);

  return <fieldset className="min-w-0">
    <legend className="mb-1.5 text-xs font-semibold text-[var(--muted-foreground)]">{legend}</legend>
    <input type="hidden" name={name} value={value} />
    <div className="flex gap-1.5" role="group">
      {options.map((option) => <button
        key={option}
        type="button"
        aria-pressed={option === value}
        onClick={() => onChange(option)}
        className={cn(
          "h-10 min-w-0 flex-1 truncate rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]",
          option === value
            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "bg-[var(--card)]/45 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)]",
        )}
      >{option}</button>)}
    </div>
  </fieldset>;
}

/** Segmented picker with the chosen option explaining itself underneath. */
function Tiers({
  legend, name, options, value, onChange,
}: {
  legend: string;
  name: string;
  options: readonly { value: string; label: string; description: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return <fieldset className="min-w-0">
    <legend className="mb-1.5 text-xs font-semibold text-[var(--muted-foreground)]">{legend}</legend>
    <input type="hidden" name={name} value={value} />
    <div className="flex gap-1.5" role="group">
      {options.map((option) => <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
        className={cn(
          "h-10 min-w-0 flex-1 truncate rounded-xl border px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]",
          option.value === value
            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
            : "bg-[var(--card)]/45 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)]",
        )}
      >{option.label}</button>)}
    </div>
    <p className="mt-1.5 text-xs leading-5 text-[var(--muted-foreground)]">
      {options.find((option) => option.value === value)?.description}
    </p>
  </fieldset>;
}

type LobbySettingsFormProps = {
  roomId: string;
  settings: GameSettings;
  categories: { category: string; wordCount: number }[];
};

/**
 * The host's settings panel.
 *
 * Save is disabled until something actually differs from the room. It used to be
 * permanently live and silent, so there was no way to tell a real save from a
 * no-op -- now the button being enabled *is* the unsaved indicator, and a toast
 * confirms the write landed.
 *
 * Your last saved configuration is remembered on this device and offered to a
 * room nobody has configured yet, as a button rather than an automatic prefill:
 * the settings visibly change and Save lights up, so nothing is altered without
 * the host watching it happen.
 *
 * Turning the hint below DECOY switches hidden roles back off as you do it,
 * rather than letting you build a combination the database will refuse.
 */
export function LobbySettingsForm({ roomId, settings, categories }: LobbySettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateGameSettings, emptySavedFormState);
  const { toast } = useToast();
  const ids = useId();

  /**
   * The host's unsaved edits, or null while the panel is simply showing the
   * room.
   *
   * Deliberately an override rather than a copy kept in step with the server.
   * The lobby re-renders whenever the poll or a realtime signal lands, so a copy
   * would need an effect to re-sync -- and syncing state from props in an effect
   * is the pattern React now warns about, on top of being the thing that would
   * throw away a half-made change when somebody joined.
   *
   * Deriving instead also makes the save resolve itself: once the write lands
   * and the page revalidates, `settings` equals the override, `dirty` goes
   * false, and Save greys out without anything having to clear it.
   */
  const [override, setOverride] = useState<GameSettings | null>(null);

  /** Bumped only by Discard and the prefill, to re-seed the uncontrolled selects. */
  const [resetKey, setResetKey] = useState(0);

  const remembered = useSyncExternalStore(
    gameSettingsPreference.subscribe,
    gameSettingsPreference.read,
    gameSettingsPreference.serverSnapshot,
  );

  const draft = override ?? settings;
  const dirty = override !== null && !gameSettingsEqual(override, settings);

  // Offered rather than applied: a room nobody has configured yet can adopt the
  // settings you last hosted with, but only because you asked it to.
  const canPrefill =
    !dirty
    && gameSettingsEqual(settings, DEFAULT_GAME_SETTINGS)
    && !gameSettingsEqual(remembered, DEFAULT_GAME_SETTINGS);

  function update(next: Partial<GameSettings>) {
    setOverride(reconcileGameSettings({ ...draft, ...next }));
  }

  function applyRemembered() {
    setOverride(reconcileGameSettings(remembered));
    setResetKey((key) => key + 1);
  }

  function discard() {
    setOverride(null);
    setResetKey((key) => key + 1);
  }

  // Confirmation only -- no state is set here, so this stays a side effect on an
  // external system rather than a render loop.
  useEffect(() => {
    if (state.savedAt !== null) toast("Settings saved");
  }, [state.savedAt, toast]);

  const categoryOptions: SelectOption[] = [
    { value: "", label: "All categories" },
    ...categories.map(({ category, wordCount }) => ({ value: category, label: `${category} (${wordCount})` })),
  ];

  const maxPlayerOptions: SelectOption[] = Array.from(
    { length: GAME_SETTINGS_BOUNDS.maxPlayers.max - GAME_SETTINGS_BOUNDS.maxPlayers.min + 1 },
    (_, index) => {
      const value = String(GAME_SETTINGS_BOUNDS.maxPlayers.min + index);
      return { value, label: value };
    },
  );

  return <form
    action={formAction}
    onSubmit={() => gameSettingsPreference.write(draft)}
    className="grid gap-5"
  >
    <input type="hidden" name="roomId" value={roomId} />

    <Section title="The imposter" hint="How much the imposter is given to work with.">
      <fieldset className="grid gap-2">
        <legend className="sr-only">What the imposter is told</legend>
        {IMPOSTER_HINTS.map((hint) => {
          const active = draft.imposterHint === hint;
          return <label key={hint} className={cn(
            "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--primary-soft)]",
            active
              ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[var(--primary-soft)]"
              : "bg-[var(--card)]/45 hover:bg-[var(--surface-subtle)]",
          )}>
            <input
              type="radio"
              name="imposterHint"
              value={hint}
              checked={active}
              onChange={() => update({ imposterHint: hint })}
              className="sr-only"
            />
            <span aria-hidden className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
              active ? "border-[var(--primary)]" : "border-[var(--border)]",
            )}>
              {active && <span className="size-2.5 rounded-full bg-[var(--primary)]" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{IMPOSTER_HINT_LABELS[hint].label}</span>
              <span className="mt-0.5 block text-xs leading-5 text-[var(--muted-foreground)]">{IMPOSTER_HINT_LABELS[hint].description}</span>
            </span>
          </label>;
        })}
      </fieldset>

      <Toggle
        name="hideRoles"
        label="Hide roles"
        hint={canHideRoles(draft.imposterHint)
          ? "Nobody is told what they are. Everyone just has a word — you work out that yours is the odd one."
          : "Needs the decoy word: with nothing in hand, an empty card tells the imposter what they are."}
        checked={draft.hideRoles}
        disabled={!canHideRoles(draft.imposterHint)}
        onChange={(next) => update({ hideRoles: next })}
      />
    </Section>

    <Section title="The round">
      <div className="grid gap-3 sm:grid-cols-2">
        <Steps
          legend="Imposters"
          name="imposterCount"
          min={GAME_SETTINGS_BOUNDS.imposterCount.min}
          max={GAME_SETTINGS_BOUNDS.imposterCount.max}
          value={draft.imposterCount}
          onChange={(next) => update({ imposterCount: next })}
        />
        <Steps
          legend="Clue passes"
          name="cluePasses"
          min={GAME_SETTINGS_BOUNDS.cluePasses.min}
          max={GAME_SETTINGS_BOUNDS.cluePasses.max}
          value={draft.cluePasses}
          onChange={(next) => update({ cluePasses: next })}
        />
      </div>

      <Toggle
        name="discussionPhase"
        label="Talk before voting"
        hint="A pause after the last clue with the vote locked, instead of voting opening the instant someone finishes."
        checked={draft.discussionPhase}
        onChange={(next) => update({ discussionPhase: next })}
      />
      <Toggle
        name="banRepeatClues"
        label="No repeated clues"
        hint="Refuses a clue somebody already said. Echoing the last player is the safest thing an imposter can do."
        checked={draft.banRepeatClues}
        onChange={(next) => update({ banRepeatClues: next })}
      />
      <Toggle
        name="imposterFinalGuess"
        label="Caught imposter can guess"
        hint="Voted out, they still take the round by naming the word."
        checked={draft.imposterFinalGuess}
        onChange={(next) => update({ imposterFinalGuess: next })}
      />
    </Section>

    <Section title="The words">
      <Tiers
        legend="How obscure words can get"
        name="wordDifficulty"
        options={WORD_DIFFICULTIES.map((level) => ({ value: level, ...WORD_DIFFICULTY_LABELS[level] }))}
        value={draft.wordDifficulty}
        onChange={(next) => update({ wordDifficulty: next as WordDifficulty })}
      />
      <div className="field-label">
        <span id={`${ids}-category`}>Draw words from</span>
        <PremiumSelect
          key={`category-${resetKey}`}
          name="categoryFilter"
          defaultValue={draft.categoryFilter ?? ""}
          options={categoryOptions}
          labelledBy={`${ids}-category`}
          onValueChange={(value) => update({ categoryFilter: value === "" ? null : value })}
        />
        <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">
          Counts are for the difficulty you last saved.
        </span>
      </div>
    </Section>

    <Section title="The room">
      <div className="grid gap-3">
        <div className="field-label">
          <span id={`${ids}-max`}>Max players</span>
          <PremiumSelect
            key={`max-${resetKey}`}
            name="maxPlayers"
            defaultValue={String(draft.maxPlayers)}
            options={maxPlayerOptions}
            labelledBy={`${ids}-max`}
            onValueChange={(value) => update({ maxPlayers: Number(value) })}
          />
        </div>
      </div>
    </Section>

    <FormError message={state.message} />

    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <p className="text-xs text-[var(--muted-foreground)]">
        {dirty ? "Unsaved changes" : "Everything saved"}
      </p>
      <div className="flex gap-2">
        {canPrefill && <Button type="button" variant="ghost" size="sm" onClick={applyRemembered}>
          <History className="size-3.5" />
          Use my last settings
        </Button>}
        {dirty && <Button type="button" variant="ghost" size="sm" onClick={discard}>
          <RotateCcw className="size-3.5" />
          Discard
        </Button>}
        <Button type="submit" size="sm" disabled={pending || !dirty}>
          <Settings2 className="size-3.5" />
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  </form>;
}
