/**
 * The shape a job or settings form gets back when the server rejects its input.
 *
 * Lives outside the actions module because a "use server" file may only export
 * async functions -- a shared initial-state constant cannot live beside the
 * actions that return it.
 */
export type FormActionState = { message: string };

export const emptyFormState: FormActionState = { message: "" };
