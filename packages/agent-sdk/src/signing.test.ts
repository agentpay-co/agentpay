import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import {
  signManifest,
  signFeedback,
  verifyManifest,
  verifyFeedbackSignature,
  stripSignature,
} from './signing.js';
import type { RegistrationPayload } from './types.js';
import type { AgentFeedback } from '@agentpay/common';

const keypair = Keypair.random();

const manifest: RegistrationPayload = {
  agent_id: 'test-agent',
  name: 'Test Agent',
  description: 'signing test agent',
  capabilities: ['test'],
  pricing: { model: 'x402', price_per_call: 0.01, currency: 'USDC' },
  endpoint: 'https://agents.example.com/test/query',
  stellar_address: keypair.publicKey(),
  health_check: 'https://agents.example.com/test/health',
};

const feedback: AgentFeedback = {
  agent_id: 'test-agent',
  job_id: 'job-1',
  success: true,
  quality_rating: 5,
  latency_ms: 120,
  timestamp: new Date().toISOString(),
};

describe('manifest signing', () => {
  it('signs and verifies a manifest round-trip', () => {
    const signed = signManifest(keypair.secret(), manifest);
    expect(typeof signed.signature).toBe('string');
    expect(verifyManifest(signed)).toBe(true);
  });

  it('fails verification after tampering', () => {
    const signed = signManifest(keypair.secret(), manifest);
    expect(verifyManifest({ ...signed, pricing: { ...signed.pricing, price_per_call: 99 } })).toBe(
      false,
    );
  });

  it('fails when the signature is missing or the address is wrong', () => {
    expect(verifyManifest({ ...manifest } as never)).toBe(false);
    const signed = signManifest(keypair.secret(), manifest);
    expect(verifyManifest({ ...signed, stellar_address: Keypair.random().publicKey() })).toBe(
      false,
    );
  });

  it('stripSignature never signs stale bytes on re-sign', () => {
    const once = signManifest(keypair.secret(), manifest);
    const twice = signManifest(keypair.secret(), once);
    // Re-signing the signed body covers the same canonical bytes.
    expect(twice.signature).toBe(once.signature);
    expect(verifyManifest(twice)).toBe(true);
  });
});

describe('feedback signing', () => {
  it('signs and verifies a feedback round-trip', () => {
    const signed = signFeedback(keypair.secret(), feedback);
    expect(verifyFeedbackSignature(keypair.publicKey(), signed)).toBe(true);
  });

  it('rejects tampered feedback and wrong keys', () => {
    const signed = signFeedback(keypair.secret(), feedback);
    expect(verifyFeedbackSignature(keypair.publicKey(), { ...signed, quality_rating: 1 })).toBe(
      false,
    );
    expect(verifyFeedbackSignature(Keypair.random().publicKey(), signed)).toBe(false);
  });
});
