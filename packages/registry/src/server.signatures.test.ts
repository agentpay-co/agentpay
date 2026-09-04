import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { signPayload } from '@agentpay/common';
import type { Express } from 'express';

process.env.AGENTPAY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-signatures-'));
process.env.NODE_ENV = 'test';

const { app } = (await import('./server.js')) as { app: Express };

afterAll(() => {
  fs.rmSync(process.env.AGENTPAY_DATA_DIR!, { recursive: true, force: true });
  delete process.env.AGENTPAY_DATA_DIR;
});

function manifestFor(keypair: Keypair, id: string) {
  return {
    agent_id: id,
    name: `Agent ${id}`,
    description: 'signature test agent',
    capabilities: ['test'],
    pricing: { model: 'x402', price_per_call: 0.05, currency: 'USDC' },
    endpoint: `https://agents.example.com/${id}`,
    stellar_address: keypair.publicKey(),
    health_check: `https://agents.example.com/${id}/health`,
  };
}

describe('signed registration', () => {
  it('accepts a validly signed manifest and stamps it verified', async () => {
    const keypair = Keypair.random();
    const manifest = manifestFor(keypair, 'signed-agent-1');
    const res = await request(app)
      .post('/register')
      .send({ ...manifest, signature: signPayload(keypair.secret(), manifest) });
    expect(res.status).toBe(200);
    expect(res.body.signature_verified).toBe(true);
    expect(res.body.signature).toBeUndefined();
  });

  it('rejects a tampered manifest with 401', async () => {
    const keypair = Keypair.random();
    const manifest = manifestFor(keypair, 'signed-agent-2');
    const signature = signPayload(keypair.secret(), manifest);
    const res = await request(app)
      .post('/register')
      .send({
        ...manifest,
        pricing: { model: 'x402', price_per_call: 999, currency: 'USDC' },
        signature,
      });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
  });

  it('rejects a signature from the wrong key with 401', async () => {
    const keypair = Keypair.random();
    const manifest = manifestFor(keypair, 'signed-agent-3');
    const signature = signPayload(Keypair.random().secret(), manifest);
    const res = await request(app)
      .post('/register')
      .send({ ...manifest, signature });
    expect(res.status).toBe(401);
  });

  it('rejects a non-string signature with 401', async () => {
    const keypair = Keypair.random();
    const res = await request(app)
      .post('/register')
      .send({ ...manifestFor(keypair, 'signed-agent-4'), signature: 12345 });
    expect(res.status).toBe(401);
  });

  it('still accepts unsigned manifests as unverified (transition)', async () => {
    const keypair = Keypair.random();
    const res = await request(app).post('/register').send(manifestFor(keypair, 'unsigned-agent-1'));
    expect(res.status).toBe(200);
    expect(res.body.signature_verified).toBe(false);
  });
});

describe('signed feedback', () => {
  it('accepts validly signed, unsigned, and rejects badly signed feedback', async () => {
    const keypair = Keypair.random();
    const manifest = manifestFor(keypair, 'feedback-agent-1');
    const reg = await request(app)
      .post('/register')
      .send({ ...manifest, signature: signPayload(keypair.secret(), manifest) });
    expect(reg.status).toBe(200);

    const feedback = {
      agent_id: 'feedback-agent-1',
      job_id: 'job-1',
      success: true,
      quality_rating: 5,
      latency_ms: 100,
      timestamp: new Date().toISOString(),
    };

    const signed = await request(app)
      .post('/feedback')
      .send({ ...feedback, signature: signPayload(keypair.secret(), feedback) });
    expect(signed.status).toBe(200);

    const legacy = await request(app)
      .post('/feedback')
      .send({ ...feedback, job_id: 'job-2' });
    expect(legacy.status).toBe(200);

    const bad = await request(app)
      .post('/feedback')
      .send({
        ...feedback,
        job_id: 'job-3',
        quality_rating: 1,
        signature: signPayload(keypair.secret(), feedback),
      });
    expect(bad.status).toBe(401);
  });
});
