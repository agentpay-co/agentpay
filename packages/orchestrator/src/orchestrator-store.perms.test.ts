import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-store-'));
  process.env.AGENTPAY_DATA_DIR = dir;
  vi.resetModules();
});

afterEach(() => {
  delete process.env.AGENTPAY_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('orchestrator-store permissions', () => {
  it('creates and keeps orchestrators.json owner-only', async () => {
    const store = await import('./orchestrator-store.js');
    const storePath = path.join(dir, 'orchestrators.json');

    store.upsert({
      user_address: 'GUSER',
      orchestrator_name: 'test',
      orchestrator_pubkey: 'GPUB',
      orchestrator_secret: 'SSECRET',
      registered_on_chain: false,
      created_at: new Date().toISOString(),
    });

    expect(fs.statSync(storePath).mode & 0o777).toBe(0o600);
    expect(store.getByUser('GUSER')?.orchestrator_pubkey).toBe('GPUB');
  });
});
