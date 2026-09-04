/**
 * Manifest and feedback signing for third-party agents.
 *
 * Signing your manifest proves control of the `stellar_address` it claims,
 * so nobody else can register (or impersonate) your agent id. The registry
 * verifies the signature when present and rejects malformed ones; unsigned
 * manifests are still accepted during the transition period.
 *
 * ```ts
 * import { signManifest } from '@agentpay/agent-sdk';
 * const body = signManifest(secretKey, manifest); // {...manifest, signature}
 * await fetch(`${REGISTRY_URL}/register`, {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(body),
 * });
 * ```
 */
import { signPayload, verifyPayloadSignature, type SignablePayload } from '@agentpay/common';
import type { AgentFeedback } from '@agentpay/common';
import type { RegistrationPayload } from './types.js';

/** A manifest (or feedback) carrying a base64 `signature` field. */
export type Signed<T> = T & { signature: string };

/** Strip a previous signature so re-signing never covers stale bytes. */
export function stripSignature<T extends object>(body: T): Omit<T, 'signature'> {
  const record = body as unknown as Record<string, unknown>;
  const { signature: _dropped, ...rest } = record;
  void _dropped;
  return rest as Omit<T, 'signature'>;
}

/**
 * Sign a registration manifest with the wallet secret matching
 * `manifest.stellar_address`. Returns the manifest plus `signature`.
 */
export function signManifest(
  secretKey: string,
  manifest: RegistrationPayload,
): Signed<RegistrationPayload> {
  const clean = stripSignature(manifest) as SignablePayload;
  return { ...manifest, signature: signPayload(secretKey, clean) };
}

/** Verify a signed manifest against the address it claims. */
export function verifyManifest(manifest: Signed<RegistrationPayload>): boolean {
  if (!manifest.stellar_address || typeof manifest.signature !== 'string') return false;
  const clean = stripSignature(manifest) as SignablePayload;
  return verifyPayloadSignature(manifest.stellar_address, clean, manifest.signature);
}

/**
 * Sign a feedback payload. The signature is verified against the stored
 * agent address when present; it attests the report, it does not replace
 * reputation math.
 */
export function signFeedback(secretKey: string, feedback: AgentFeedback): Signed<AgentFeedback> {
  const clean = stripSignature(feedback) as SignablePayload;
  return { ...feedback, signature: signPayload(secretKey, clean) };
}

/** Verify a signed feedback payload against the given agent address. */
export function verifyFeedbackSignature(
  agentAddress: string,
  feedback: Signed<AgentFeedback>,
): boolean {
  if (typeof feedback.signature !== 'string') return false;
  const clean = stripSignature(feedback) as SignablePayload;
  return verifyPayloadSignature(agentAddress, clean, feedback.signature);
}
