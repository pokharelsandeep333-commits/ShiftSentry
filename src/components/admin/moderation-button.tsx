"use client";

import { useActionState, useEffect } from "react";
import { endGameRoomAsAdmin, removeGamePlayerAsAdmin, resetGameNameAsAdmin } from "@/app/actions/admin";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { useToast } from "@/components/ui/toast-provider";
import { emptySavedFormState } from "@/lib/form-state";

const ACTIONS = {
  end: { run: endGameRoomAsAdmin, done: "Room ended" },
  remove: { run: removeGamePlayerAsAdmin, done: "Player removed" },
  reset: { run: resetGameNameAsAdmin, done: "Name reset" },
} as const;

/**
 * One moderation control: a confirm-first button that reports back in place.
 * Every one of these acts on other people mid-game, so none is a single tap.
 */
export function ModerationButton({ kind, roomId, code, userId, label, question, detail }: { kind: keyof typeof ACTIONS; roomId: string; code: string; userId?: string; label: string; question: string; detail: string }) {
  const [state, action] = useActionState(ACTIONS[kind].run, emptySavedFormState);
  const { toast } = useToast();
  const doneMessage = ACTIONS[kind].done;
  useEffect(() => {
    if (state.savedAt) toast(doneMessage);
  }, [state.savedAt, doneMessage, toast]);

  return <form action={action} className="grid justify-items-end gap-1">
    <input type="hidden" name="roomId" value={roomId} />
    <input type="hidden" name="code" value={code} />
    {userId && <input type="hidden" name="userId" value={userId} />}
    <ConfirmSubmit label={label} confirmLabel={question} detail={detail} variant={kind === "end" ? "outline" : "ghost"} />
    {state.message && <p role="alert" className="max-w-56 text-right text-xs text-[var(--danger)]">{state.message}</p>}
  </form>;
}
