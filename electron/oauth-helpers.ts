import { createHash, randomBytes } from "node:crypto";

export function createPkcePair() {
  const verifier = randomBytes(48).toString("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function isInvalidGrant(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { error?: unknown }).error === "invalid_grant"
  );
}
