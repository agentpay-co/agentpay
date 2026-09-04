import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { canonicalize, signPayload, verifyPayloadSignature } from './payload-signing.js';

const keypair = Keypair.random();
const other = Keypair.random();

describe('canonicalize', () => {
  it('sorts object keys recursively and deterministically', () => {
    const a = canonicalize({ z: 1, a: { d: 4, b: 2 }, m: [3, { y: 1, x: 2 }] });
    const b = canonicalize({ a: { b: 2, d: 4 }, m: [3, { x: 2, y: 1 }], z: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"b":2,"d":4},"m":[3,{"x":2,"y":1}],"z":1}');
  });
});

describe('signPayload / verifyPayloadSignature', () => {
  const payload = { agent_id: 'a-1', capabilities: ['x'], pricing: { model: 'x402' } };

  it('round-trips a valid signature', () => {
    const sig = signPayload(keypair.secret(), payload);
    expect(verifyPayloadSignature(keypair.publicKey(), payload, sig)).toBe(true);
  });

  it('is deterministic for the same key and payload', () => {
    expect(signPayload(keypair.secret(), payload)).toBe(signPayload(keypair.secret(), payload));
  });

  it('rejects tampered payloads', () => {
    const sig = signPayload(keypair.secret(), payload);
    expect(verifyPayloadSignature(keypair.publicKey(), { ...payload, agent_id: 'a-2' }, sig)).toBe(
      false,
    );
  });

  it('rejects the wrong public key', () => {
    const sig = signPayload(keypair.secret(), payload);
    expect(verifyPayloadSignature(other.publicKey(), payload, sig)).toBe(false);
  });

  it('returns false (never throws) on garbage input', () => {
    expect(verifyPayloadSignature('NOTAKEY', payload, '!!!')).toBe(false);
    expect(verifyPayloadSignature(keypair.publicKey(), payload, 'short')).toBe(false);
    expect(verifyPayloadSignature(keypair.publicKey(), payload, '')).toBe(false);
  });
});
