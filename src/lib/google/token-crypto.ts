import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Google OAuth tokens at rest. AES-256-GCM with a random 12-byte IV and the
 * owning user's id as associated data, so a ciphertext copied into another
 * user's row does not decrypt. Format: `v1:` + base64(iv | ciphertext | tag);
 * the version prefix is what lets the key rotate later, and anything else is
 * refused rather than guessed at.
 *
 * Server-only: imported by route handlers, Server Actions and server components.
 */
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class TokenDecryptError extends Error {
  constructor() {
    super("Stored Google token could not be decrypted.");
    this.name = "TokenDecryptError";
  }
}

export function parseEncryptionKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function encryptToken(plaintext: string, userId: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64")}`;
}

export function decryptToken(ciphertext: string, userId: string, key: Buffer): string {
  const [version, payload] = ciphertext.split(":", 2);
  if (version !== VERSION || !payload) throw new TokenDecryptError();
  try {
    const bytes = Buffer.from(payload, "base64");
    if (bytes.length <= IV_BYTES + TAG_BYTES) throw new TokenDecryptError();
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenDecryptError();
  }
}
