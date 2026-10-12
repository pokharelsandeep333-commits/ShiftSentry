import assert from "node:assert/strict";
import test from "node:test";
import { deleteAccountSafely, type DeletionOperations } from "./account-deletion";

function operations(calls: string[], failing?: keyof DeletionOperations): DeletionOperations {
  return Object.fromEntries(["lock", "revokeSessions", "revokeCalendar", "deleteAccount"].map((step) => [step, async () => {
    calls.push(step);
    if (step === failing) throw new Error("provider response must not reach the user");
  }])) as DeletionOperations;
}
test("deletion locks concurrent writes before revoking sessions and deleting", async () => {
  const calls: string[] = [];
  assert.equal((await deleteAccountSafely(operations(calls))).status, "deleted");
  assert.deepEqual(calls, ["lock", "revokeSessions", "revokeCalendar", "deleteAccount"]);
});
test("failed session revocation prevents deletion and keeps a recoverable lock", async () => {
  const calls: string[] = [];
  const result = await deleteAccountSafely(operations(calls, "revokeSessions"));
  assert.equal(result.status, "locked");
  assert.deepEqual(calls, ["lock", "revokeSessions"]);
  assert.equal(result.message.includes("provider response"), false);
});
test("calendar revocation failure does not retain the local account", async () => {
  const calls: string[] = [];
  assert.equal((await deleteAccountSafely(operations(calls, "revokeCalendar"))).status, "deleted");
  assert.equal(calls.at(-1), "deleteAccount");
});
test("lock failure has no destructive side effects and delete failure is never success", async () => {
  const calls: string[] = [];
  assert.equal((await deleteAccountSafely(operations(calls, "lock"))).status, "failed");
  assert.deepEqual(calls, ["lock"]);
  assert.equal((await deleteAccountSafely(operations([], "deleteAccount"))).status, "locked");
});
