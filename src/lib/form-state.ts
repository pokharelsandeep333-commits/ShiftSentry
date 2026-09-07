/**
 * The shape a job or settings form gets back when the server rejects its input.
 *
 * Lives outside the actions module because a "use server" file may only export
 * async functions -- a shared initial-state constant cannot live beside the
 * actions that return it.
 */
export type FormActionState = { message: string };

export const emptyFormState: FormActionState = { message: "" };

/**
 * For forms that stay on the page after a successful write.
 *
 * `FormActionState` can only say "here is what went wrong", which is enough for
 * a form that redirects on success. A settings panel does not redirect, so a
 * successful save is indistinguishable from never having submitted -- the
 * complaint that there is no way to tell it worked. `savedAt` changes on each
 * success, which the client watches to confirm and to reset its idea of what
 * counts as unsaved.
 */
export type SavedFormState = { message: string; savedAt: number | null };

export const emptySavedFormState: SavedFormState = { message: "", savedAt: null };
