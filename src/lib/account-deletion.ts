export type DeletionOperations = {
  lock: () => Promise<void>;
  revokeSessions: () => Promise<void>;
  revokeCalendar: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};
export type DeletionResult = { status: "deleted" | "failed" | "locked"; message: string };

/** The lock persists after a partial failure: stale JWTs must never regain writes. */
export async function deleteAccountSafely(operations: DeletionOperations): Promise<DeletionResult> {
  try { await operations.lock(); }
  catch { return { status: "failed", message: "We could not start deletion. Your account has not been deleted. Please try again." }; }
  try {
    await operations.revokeSessions();
    // A Google outage must not force us to retain a user's local credentials.
    try { await operations.revokeCalendar(); } catch { /* Stored tokens are removed with the account. */ }
    await operations.deleteAccount();
    return { status: "deleted", message: "Your account has been deleted." };
  } catch {
    return { status: "locked", message: "Deletion has not completed. Workspace writes are locked for your safety. Contact support to finish deletion; signing in may no longer work." };
  }
}
