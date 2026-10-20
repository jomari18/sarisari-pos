import { hash, verify } from "@node-rs/argon2";

// argon2id (the library default) at the OWASP baseline: 19 MiB of memory, 2 passes, 1 thread.
// The parameters travel inside each hash, so raising them later still verifies older hashes.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Hashes an owner password or a bantay PIN for storage (spec 12). */
export function hashSecret(secret: string): Promise<string> {
  return hash(secret, OPTIONS);
}

export function verifySecret(stored: string, secret: string): Promise<boolean> {
  return verify(stored, secret);
}
