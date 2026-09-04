/**
 * Canonical payload signing with Stellar keypairs.
 *
 * Agents prove control of their claimed `stellar_address` by signing a
 * canonical encoding of their manifest; the registry verifies the signature
 * before admitting them. Canonicalisation is sorted-key JSON so any SDK in
 * any language can reproduce the exact signed bytes:
 * objects sort keys recursively, arrays keep order, and the output is UTF-8.
 */
import { Keypair } from '@stellar/stellar-sdk';

export type SignablePayload = Record<string, unknown>;

/** Deterministic JSON encoding: object keys sorted recursively. */
export function canonicalize(payload: SignablePayload): string {
  return JSON.stringify(sortValue(payload));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Sign a payload with a Stellar secret key. Returns the base64 signature.
 * The signature covers ONLY the payload — never sign an object that still
 * contains a previous `signature` field (strip it first).
 */
export function signPayload(secretKey: string, payload: SignablePayload): string {
  const bytes = Buffer.from(canonicalize(payload), 'utf8');
  return Keypair.fromSecret(secretKey).sign(bytes).toString('base64');
}

/**
 * Verify a base64 signature over a payload against a Stellar public key.
 * Returns false (never throws) for bad keys, malformed signatures, key
 * mismatch, or payload tampering.
 */
export function verifyPayloadSignature(
  publicKey: string,
  payload: SignablePayload,
  signature: string,
): boolean {
  try {
    const keypair = Keypair.fromPublicKey(publicKey);
    const bytes = Buffer.from(canonicalize(payload), 'utf8');
    const sig = Buffer.from(signature, 'base64');
    if (sig.length !== 64) return false;
    return keypair.verify(bytes, sig);
  } catch {
    return false;
  }
}
