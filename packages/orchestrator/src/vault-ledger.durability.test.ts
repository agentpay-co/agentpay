import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-durability-'));
  process.env.AGENTPAY_DATA_DIR = dir;
  vi.resetModules();
});

afterEach(() => {
  delete process.env.AGENTPAY_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('vault-ledger durability', () => {
  it('a burst of appends keeps every entry with unique ids', async () => {
    const ledger = await import('./vault-ledger.js');
    const N = 500;
    for (let i = 0; i < N; i++) {
      ledger.appendVaultTx({
        user_address: `GUSER${i % 10}`,
        type: 'payment',
        amount_usdc: 0.02,
        task_id: `task-${i}`,
      });
    }

    expect(ledger.getAllVaultTx('GUSER0')).toHaveLength(N / 10);
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(dir, 'vault-ledger.json'), 'utf8'),
    ) as Array<{ id: string }>;
    expect(onDisk).toHaveLength(N);
    expect(new Set(onDisk.map((e) => e.id)).size).toBe(N);
  });
});
