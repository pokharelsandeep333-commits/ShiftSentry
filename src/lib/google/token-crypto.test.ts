import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { TokenDecryptError, decryptToken, encryptToken, parseEncryptionKey } from "./token-crypto";

const key = randomBytes(32);
const alice = "11111111-1111-1111-1111-111111111111";
const bob = "22222222-2222-2222-2222-222222222222";

test("round-trips a token for the same user", () => {
  const sealed = encryptToken("1//refresh-token", alice, key);
  assert.match(sealed, /^v1:/);
  assert.equal(decryptToken(sealed, alice, key), "1//refresh-token");
});

test("uses a fresh IV, so the same token never encrypts the same way twice", () => {
  assert.notEqual(encryptToken("same", alice, key), encryptToken("same", alice, key));
});

test("refuses a ciphertext moved to another user's row", () => {
  const sealed = encryptToken("1//refresh-token", alice, key);
  assert.throws(() => decryptToken(sealed, bob, key), TokenDecryptError);
});

test("refuses a tampered ciphertext", () => {
  const sealed = encryptToken("1//refresh-token", alice, key);
  const bytes = Buffer.from(sealed.slice(3), "base64");
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => decryptToken(`v1:${bytes.toString("base64")}`, alice, key), TokenDecryptError);
});

test("refuses an unknown version and a wrong key", () => {
  const sealed = encryptToken("1//refresh-token", alice, key);
  assert.throws(() => decryptToken(sealed.replace(/^v1:/, "v9:"), alice, key), TokenDecryptError);
  assert.throws(() => decryptToken(sealed, alice, randomBytes(32)), TokenDecryptError);
});

test("accepts only a 32-byte base64 key", () => {
  assert.equal(parseEncryptionKey(randomBytes(32).toString("base64")).length, 32);
  assert.throws(() => parseEncryptionKey(randomBytes(16).toString("base64")));
  assert.throws(() => parseEncryptionKey(""));
});
